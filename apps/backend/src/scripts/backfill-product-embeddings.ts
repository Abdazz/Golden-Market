import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { computeProductContentHash } from "../lib/product-embedding-hash"
import { embedText } from "../lib/product-embedding-client"
import {
  getStoredContentHash,
  upsertProductEmbedding,
} from "../lib/product-embedding-store"

// One-shot idempotent : embarque tous les produits publiés qui n'ont pas
// encore d'embedding à jour (même hash de contenu que la dernière fois). À
// lancer après create-product-embedding-schema.ts.
export default async function backfillProductEmbeddings({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    logger.info("OPENAI_API_KEY non configurée, backfill ignoré.")
    return
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "description"],
    filters: { status: "published" },
  })

  let embedded = 0
  let skipped = 0

  for (const product of products as Array<{
    id: string
    title: string
    description: string | null
  }>) {
    const contentHash = computeProductContentHash(product.title, product.description)
    const storedHash = await getStoredContentHash(pg, product.id)

    if (storedHash === contentHash) {
      skipped += 1
      continue
    }

    const embedding = await embedText(
      `${product.title}\n${product.description ?? ""}`,
      apiKey
    )
    await upsertProductEmbedding(pg, {
      productId: product.id,
      embedding,
      contentHash,
    })
    logger.info(`"${product.title}" -> embedding créé/mis à jour.`)
    embedded += 1
  }

  logger.info(`Backfill terminé : ${embedded} embarqué(s), ${skipped} déjà à jour.`)
}
