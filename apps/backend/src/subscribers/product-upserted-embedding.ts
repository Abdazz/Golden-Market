import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { computeProductContentHash } from "../lib/product-embedding-hash"
import { embedText } from "../lib/product-embedding-client"
import {
  getStoredContentHash,
  upsertProductEmbedding,
} from "../lib/product-embedding-store"

/**
 * Recalcule l'embedding uniquement si le titre/description a réellement
 * changé (pas à chaque mise à jour de prix/stock) - même pattern défensif
 * (try/catch, jamais de throw) que les autres subscribers Meta.
 */
export default async function productUpsertedEmbeddingHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    logger.info(
      `Produit ${event.data.id} modifié — OPENAI_API_KEY non configurée, embedding ignoré`
    )
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  try {
    const {
      data: [product],
    } = await query.graph({
      entity: "product",
      fields: ["id", "title", "description"],
      filters: { id: event.data.id },
    })

    if (!product) {
      return
    }

    const contentHash = computeProductContentHash(product.title, product.description)
    const storedHash = await getStoredContentHash(pg, product.id)

    if (storedHash === contentHash) {
      return
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
    logger.info(`Produit ${event.data.id} — embedding mis à jour`)
  } catch (error) {
    logger.error(
      `Produit ${event.data.id} — échec de la mise à jour de l'embedding`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated"],
}
