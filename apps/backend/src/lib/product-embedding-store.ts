// SQL brut contre la table product_embedding - pgvector n'a pas de type DML
// natif dans Medusa v2, même approche que product-fuzzy-search.ts pour
// pg_trgm (contourne l'ORM, requête PG_CONNECTION directement). product_id
// est une référence texte "douce" vers product.id, pas une FK Medusa.
export type PgConnection = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows: any[] }>
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`
}

export async function getStoredContentHash(
  pg: PgConnection,
  productId: string
): Promise<string | null> {
  const { rows } = await pg.raw(
    "select content_hash from product_embedding where product_id = ?",
    [productId]
  )
  return rows[0]?.content_hash ?? null
}

export async function upsertProductEmbedding(
  pg: PgConnection,
  params: { productId: string; embedding: number[]; contentHash: string }
): Promise<void> {
  await pg.raw(
    `insert into product_embedding (product_id, embedding, content_hash, created_at, updated_at)
     values (?, ?::vector, ?, now(), now())
     on conflict (product_id) do update
       set embedding = excluded.embedding,
           content_hash = excluded.content_hash,
           updated_at = now()`,
    [params.productId, toVectorLiteral(params.embedding), params.contentHash]
  )
}

export async function findNearestProductIds(
  pg: PgConnection,
  params: { embedding: number[]; limit: number }
): Promise<string[]> {
  const { rows } = await pg.raw(
    `select product_id
     from product_embedding
     order by embedding <=> ?::vector
     limit ?`,
    [toVectorLiteral(params.embedding), params.limit]
  )
  return rows.map((row: { product_id: string }) => row.product_id)
}
