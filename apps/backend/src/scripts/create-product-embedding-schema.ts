import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// One-shot idempotent : crée l'extension pgvector, la table
// product_embedding et son index HNSW s'ils n'existent pas déjà.
// product_id est une référence "douce" (pas de FK Medusa) - voir
// product-embedding-store.ts et la spec pour le contexte complet.
export default async function createProductEmbeddingSchema({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  await pg.raw("CREATE EXTENSION IF NOT EXISTS vector")
  logger.info("Extension pgvector : présente.")

  await pg.raw(`
    CREATE TABLE IF NOT EXISTS product_embedding (
      product_id text PRIMARY KEY,
      embedding vector(1536) NOT NULL,
      content_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  logger.info("Table product_embedding : présente.")

  await pg.raw(`
    CREATE INDEX IF NOT EXISTS product_embedding_hnsw
    ON product_embedding
    USING hnsw (embedding vector_cosine_ops)
  `)
  logger.info("Index HNSW product_embedding_hnsw : présent.")
}
