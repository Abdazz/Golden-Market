import sharp from "sharp"

// WhatsApp Cloud API n'accepte que image/jpeg et image/png pour un message
// de type "image" (le webp y est réservé aux stickers) - c'est ce qui
// empêchait l'agent WhatsApp d'envoyer les photos fournisseur Alibaba, que le
// CDN Alibaba sert en webp même sur une URL .jpg. Le format est donc détecté
// sur le contenu réel, jamais sur l'extension ou le Content-Type annoncé.
const PASSTHROUGH: Record<string, { mimeType: string; ext: string }> = {
  jpeg: { mimeType: "image/jpeg", ext: "jpg" },
  png: { mimeType: "image/png", ext: "png" },
}

export type NormalizedImage = {
  buffer: Buffer
  mimeType: string
  ext: string
  converted: boolean
}

// Laisse un jpeg/png intact (octet pour octet), convertit tout autre format
// d'image (webp, gif, avif...) en jpeg qualité 85. Fond blanc sous les zones
// transparentes : le jpeg n'a pas de canal alpha, et un fond noir par défaut
// dénaturerait les photos produit détourées.
export const ensureJpegOrPng = async (
  input: Buffer
): Promise<NormalizedImage> => {
  const { format } = await sharp(input).metadata()
  const passthrough = format ? PASSTHROUGH[format] : undefined
  if (passthrough) {
    return { buffer: input, ...passthrough, converted: false }
  }

  const buffer = await sharp(input)
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85 })
    .toBuffer()
  return { buffer, mimeType: "image/jpeg", ext: "jpg", converted: true }
}

// Nom de fichier du jpeg de remplacement, dérivé de l'URL d'origine : retire
// le préfixe horodaté ajouté par le provider file-local ("1788384027808-")
// pour ne pas l'empiler au ré-upload, et remplace l'extension par .jpg.
export const jpegFilenameFor = (url: string): string => {
  const last = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "")
  const withoutTimestamp = last.replace(/^\d+-/, "")
  return `${withoutTimestamp.replace(/\.[a-z0-9]+$/i, "")}.jpg`
}
