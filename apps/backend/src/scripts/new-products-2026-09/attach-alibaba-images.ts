import fs from "fs"
import path from "path"
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  updateProductsWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows"

// Troisième passe pour le lot 2026-09 : ajoute aux 11 nouveaux produits les
// photos de galerie principale de la fiche fournisseur Alibaba (URLs figées
// dans alibaba-images.json). Ces photos deviennent des images secondaires ;
// la vignette d'origine (fichier Excel) reste inchangée en tête et comme
// thumbnail.
//
// - Chaque URL source est re-hébergée via le module file (uploadFilesWorkflow)
//   pour ne pas dépendre du CDN Alibaba à l'exécution.
// - Idempotent : les URLs sources déjà traitées sont mémorisées dans
//   product.metadata.alibaba_source_images ; une ré-exécution les saute.
// - fixImageUrl : même correctif que les autres scripts d'import (le provider
//   file-local renvoie des URLs sur localhost:<port par défaut>).

const MANIFEST_PATH =
  process.env.ALIBABA_IMAGES_MANIFEST ??
  path.join(__dirname, "alibaba-images.json")

function fixImageUrl(url: string): string {
  return url.replace(
    /^https?:\/\/localhost:\d+/,
    `http://localhost:${process.env.PORT || 9000}`
  )
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

async function fetchImage(
  url: string
): Promise<{ base64: string; mimeType: string; ext: string }> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} sur ${url}`)
  }
  // Le CDN Alibaba renvoie souvent du webp même sur une URL .jpg : on se fie
  // au Content-Type réel, pas à l'extension de l'URL.
  const mimeType = (res.headers.get("content-type") || "image/jpeg")
    .split(";")[0]
    .trim()
  const ext = EXT_BY_MIME[mimeType] ?? "jpg"
  const buf = Buffer.from(await res.arrayBuffer())
  return { base64: buf.toString("base64"), mimeType, ext }
}

export default async function attachAlibabaImages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModuleService = container.resolve(Modules.PRODUCT)

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"))
  const imagesByTitle: Record<string, string[]> = manifest.images

  let productsUpdated = 0
  let imagesAdded = 0
  let productsSkipped = 0
  let missing = 0

  for (const [title, sourceUrls] of Object.entries(imagesByTitle)) {
    const [product] = await productModuleService.listProducts(
      { title },
      { relations: ["images"] }
    )
    if (!product) {
      logger.error(`Produit introuvable : "${title}"`)
      missing += 1
      continue
    }

    const alreadyDone: string[] =
      (product.metadata?.alibaba_source_images as string[] | undefined) ?? []
    const toAdd = sourceUrls.filter((u) => !alreadyDone.includes(u))

    if (toAdd.length === 0) {
      logger.info(`"${title}" : toutes les images Alibaba déjà ajoutées, ignoré.`)
      productsSkipped += 1
      continue
    }

    const hostedUrls: string[] = []
    for (const url of toAdd) {
      try {
        const { base64, mimeType, ext } = await fetchImage(url)
        const { result: uploaded } = await uploadFilesWorkflow(container).run({
          input: {
            files: [
              {
                filename: `${product.handle}-ali-${hostedUrls.length + 1}.${ext}`,
                mimeType,
                content: base64,
                access: "public",
              },
            ],
          },
        })
        hostedUrls.push(fixImageUrl(uploaded[0].url))
      } catch (e) {
        logger.error(`Échec image "${url}" pour "${title}"`, e as Error)
      }
    }

    if (hostedUrls.length === 0) {
      continue
    }

    const existingImageUrls = (product.images ?? []).map((i) => ({ url: i.url }))

    await updateProductsWorkflow(container).run({
      input: {
        selector: { id: product.id },
        update: {
          images: [...existingImageUrls, ...hostedUrls.map((url) => ({ url }))],
          metadata: {
            ...(product.metadata ?? {}),
            alibaba_source_images: [...alreadyDone, ...toAdd],
          },
        },
      },
    })

    logger.info(`"${title}" : ${hostedUrls.length} image(s) ajoutée(s).`)
    productsUpdated += 1
    imagesAdded += hostedUrls.length
  }

  logger.info(
    `Terminé : ${productsUpdated} produits mis à jour (${imagesAdded} images), ` +
      `${productsSkipped} déjà faits, ${missing} introuvables.`
  )
}
