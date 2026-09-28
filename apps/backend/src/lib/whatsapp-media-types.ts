// Types de médias acceptés par WhatsApp Cloud API pour l'envoi depuis l'admin
// (spec 2026-09-28 whatsapp-chat-medias). Le type est détecté sur le contenu
// (signature des premiers octets), jamais sur le nom ni le Content-Type annoncé.

export type MediaKind = "image" | "video" | "audio" | "document"

const MB = 1048576
export const MAX_BYTES: Record<MediaKind, number> = {
  image: 5 * MB,
  video: 16 * MB,
  audio: 16 * MB,
  document: 100 * MB,
}
export const MAX_UPLOAD_BYTES = 100 * MB

export type SniffedMedia = {
  kind: MediaKind
  mimeType: string
  ext: string
  convert: "none" | "image-to-jpeg" | "voice-to-ogg"
}

type Result = { ok: true; media: SniffedMedia } | { ok: false; message: string }

const REFUSED = "Type de fichier non accepté par WhatsApp."
const ok = (media: SniffedMedia): Result => ({ ok: true, media })
const startsWith = (buffer: Buffer, signature: number[] | string, offset = 0) => {
  const sig = typeof signature === "string" ? Buffer.from(signature, "binary") : Buffer.from(signature)
  return buffer.length >= offset + sig.length && buffer.subarray(offset, offset + sig.length).equals(sig)
}
const extOf = (filename: string) => (filename.split(/[\\/]/).pop() ?? "").split(".").pop()?.toLowerCase() ?? ""

const VOICE: SniffedMedia = { kind: "audio", mimeType: "audio/ogg", ext: "ogg", convert: "voice-to-ogg" }

const OOXML: Record<string, { mimeType: string; ext: string }> = {
  docx: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
  xlsx: { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
  pptx: { mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: "pptx" },
  zip: { mimeType: "application/zip", ext: "zip" },
}
const OLE: Record<string, { mimeType: string; ext: string }> = {
  doc: { mimeType: "application/msword", ext: "doc" },
  xls: { mimeType: "application/vnd.ms-excel", ext: "xls" },
  ppt: { mimeType: "application/vnd.ms-powerpoint", ext: "ppt" },
}

export function sniffMedia(buffer: Buffer, input: { filename: string; voice: boolean }): Result {
  const ext = extOf(input.filename)
  const brand = startsWith(buffer, "ftyp", 4) ? buffer.subarray(8, 12).toString("binary") : null

  // Vocal enregistré dans le navigateur (Chrome : WebM, Safari : MP4, Firefox : OGG).
  if (input.voice) {
    if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]) || startsWith(buffer, "OggS") || brand) return ok(VOICE)
    return { ok: false, message: REFUSED }
  }

  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return ok({ kind: "image", mimeType: "image/jpeg", ext: "jpg", convert: "none" })
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) return ok({ kind: "image", mimeType: "image/png", ext: "png", convert: "none" })
  if ((startsWith(buffer, "RIFF") && startsWith(buffer, "WEBP", 8)) || startsWith(buffer, "GIF8")) {
    return ok({ kind: "image", mimeType: "image/jpeg", ext: "jpg", convert: "image-to-jpeg" })
  }
  if (brand) {
    if (["avif", "avis", "heic", "heix", "mif1", "msf1"].includes(brand)) {
      return ok({ kind: "image", mimeType: "image/jpeg", ext: "jpg", convert: "image-to-jpeg" })
    }
    if (brand === "qt  ") return { ok: false, message: "Format vidéo non accepté par WhatsApp : MP4 uniquement." }
    if (brand.startsWith("M4A")) return ok({ kind: "audio", mimeType: "audio/mp4", ext: "m4a", convert: "none" })
    if (brand.startsWith("3gp") || brand.startsWith("3g2")) {
      return ok({ kind: "video", mimeType: "video/3gpp", ext: "3gp", convert: "none" })
    }
    return ok({ kind: "video", mimeType: "video/mp4", ext: "mp4", convert: "none" })
  }
  if (startsWith(buffer, "ID3") || startsWith(buffer, [0xff, 0xfb]) || startsWith(buffer, [0xff, 0xf3]) || startsWith(buffer, [0xff, 0xf2])) {
    return ok({ kind: "audio", mimeType: "audio/mpeg", ext: "mp3", convert: "none" })
  }
  if (startsWith(buffer, "OggS")) return ok({ kind: "audio", mimeType: "audio/ogg", ext: "ogg", convert: "none" })
  if (startsWith(buffer, "%PDF")) return ok({ kind: "document", mimeType: "application/pdf", ext: "pdf", convert: "none" })
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    const known = OOXML[ext] ?? OOXML.zip
    return ok({ kind: "document", ...known, convert: "none" })
  }
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) && OLE[ext]) {
    return ok({ kind: "document", ...OLE[ext], convert: "none" })
  }
  // Texte : seulement avec une extension .txt/.csv et sans octet nul.
  if ((ext === "txt" || ext === "csv") && buffer.length > 0 && !buffer.includes(0)) {
    return ok({ kind: "document", mimeType: ext === "csv" ? "text/csv" : "text/plain", ext, convert: "none" })
  }
  return { ok: false, message: REFUSED }
}

const LABELS: Record<MediaKind, string> = {
  image: "Photo trop lourde",
  video: "Vidéo trop lourde",
  audio: "Audio trop lourd",
  document: "Document trop lourd",
}

export function sizeError(kind: MediaKind, size: number): string | null {
  return size > MAX_BYTES[kind]
    ? `${LABELS[kind]} : ${MAX_BYTES[kind] / MB} Mo maximum pour WhatsApp.`
    : null
}

// Nom affiché au client pour un document (WhatsApp le montre tel quel).
export function displayFilename(filename: string): string {
  const name = (filename.split(/[\\/]/).pop() ?? "").trim()
  return (name || "document").slice(0, 200)
}
