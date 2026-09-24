import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  updateProductsWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows"

import { ensureJpegOrPng, jpegFilenameFor } from "../lib/image-format"

// Passe ponctuelle : réencode en jpeg toutes les images produit webp (les 59
// photos fournisseur ajoutées par new-products-2026-09/attach-alibaba-images.ts,
// que le CDN Alibaba servait en webp). WhatsApp Cloud API refuse le webp pour
// un message image, ce qui empêchait l'agent WhatsApp (tool n8n
// send_product_images) d'envoyer ces photos au client.
//
// - L'ordre des images est conservé, seule l'URL des images webp change ; la
//   vignette est remplacée aussi si elle était en webp.
// - Idempotent : une ré-exécution ne trouve plus aucune URL .webp.
// - Les anciens fichiers webp restent sur le disque (plus référencés) ;
//   la correspondance ancienne -> nouvelle URL est gardée dans
//   product.metadata.webp_converted_images pour traçabilité.
// - CONVERT_DRY_RUN=1 : liste ce qui serait converti sans rien modifier.
//
// Lancement : npx medusa exec ./src/scripts/convert-webp-images-to-jpeg.ts

const isWebpUrl = (url: string) => /\.webp$/i.test(new URL(url).pathname)

// Lecture via le serveur local plutôt que l'URL publique : ne dépend pas de
// la résolution du domaine public depuis le conteneur.
const localUrl = (url: string) =>
  `http://localhost:${process.env.PORT || 9000}${new URL(url).pathname}`

// Même correctif que les autres scripts d'import : hors production, le
// provider file-local renvoie des URLs sur localhost:<port par défaut>.
const fixImageUrl = (url: string) =>
  url.replace(/^https?:\/\/localhost:\d+/, `http://localhost:${process.env.PORT || 9000}`)

export default async function convertWebpImagesToJpeg({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModuleService = container.resolve(Modules.PRODUCT)
  const dryRun = process.env.CONVERT_DRY_RUN === "1"

  const products = await productModuleService.listProducts(
    {},
    { relations: ["images"], take: null }
  )

  let productsUpdated = 0
  let imagesConverted = 0
  let failures = 0

  for (const product of products) {
    const images = [...(product.images ?? [])].sort(
      (a, b) => (a.rank ?? 0) - (b.rank ?? 0)
    )
    const webpUrls = [
      ...new Set(
        [...images.map((i) => i.url), product.thumbnail]
          .filter((u): u is string => !!u)
          .filter(isWebpUrl)
      ),
    ]
    if (webpUrls.length === 0) {
      continue
    }

    if (dryRun) {
      logger.info(`[dry-run] "${product.title}" : ${webpUrls.length} image(s) webp à convertir.`)
      imagesConverted += webpUrls.length
      productsUpdated += 1
      continue
    }

    const replacements: Record<string, string> = {}
    for (const url of webpUrls) {
      try {
        const res = await fetch(localUrl(url))
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const normalized = await ensureJpegOrPng(Buffer.from(await res.arrayBuffer()))
        const { result: uploaded } = await uploadFilesWorkflow(container).run({
          input: {
            files: [
              {
                filename: jpegFilenameFor(url),
                mimeType: normalized.mimeType,
                content: normalized.buffer.toString("base64"),
                access: "public",
              },
            ],
          },
        })
        replacements[url] = fixImageUrl(uploaded[0].url)
      } catch (e) {
        logger.error(`Échec conversion "${url}" pour "${product.title}"`, e as Error)
        failures += 1
      }
    }

    const converted = Object.keys(replacements).length
    if (converted === 0) {
      continue
    }

    const thumbnail = product.thumbnail
      ? replacements[product.thumbnail] ?? product.thumbnail
      : product.thumbnail

    await updateProductsWorkflow(container).run({
      input: {
        selector: { id: product.id },
        update: {
          images: images.map((i) => ({ url: replacements[i.url] ?? i.url })),
          thumbnail,
          metadata: {
            ...(product.metadata ?? {}),
            webp_converted_images: {
              ...((product.metadata?.webp_converted_images as Record<string, string>) ?? {}),
              ...replacements,
            },
          },
        },
      },
    })

    logger.info(`"${product.title}" : ${converted} image(s) convertie(s) en jpeg.`)
    productsUpdated += 1
    imagesConverted += converted
  }

  logger.info(
    `Terminé${dryRun ? " (dry-run, rien modifié)" : ""} : ${imagesConverted} image(s) ` +
      `sur ${productsUpdated} produit(s), ${failures} échec(s).`
  )
}
