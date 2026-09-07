import { QueryContext, getTotalVariantAvailability } from "@medusajs/framework/utils"
import { computeAvailability } from "./meta-catalog-mapping"

export const FUZZY_SEARCH_FIELDS = [
  "id",
  "title",
  "handle",
  "variants.id",
  "variants.calculated_price.calculated_amount",
  "variants.calculated_price.currency_code",
  "variants.manage_inventory",
  "variants.allow_backorder",
]

// Seuil choisi empiriquement sur le catalogue réel : les vraies fautes de
// frappe/pluriels/accents manquants scorent >= 0.6, les produits sans
// rapport restent sous 0.35 (voir HANDOFF.md 2026-09-07). 0.4 laisse une
// marge confortable des deux côtés.
const SIMILARITY_THRESHOLD = 0.4

/**
 * Résout les ids produits dont le titre ressemble à `q` (pg_trgm
 * word_similarity, tolérant aux fautes de frappe/accents/singulier-pluriel)
 * - contrairement à /store/products?q= qui fait un matching littéral. Ne
 * corrige pas les écarts purement lexicaux (synonymes) : "balai" ne
 * matchera jamais "serpillière", ça relève d'une recherche sémantique, hors
 * scope ici (voir HANDOFF.md).
 */
export async function findSimilarProductIds(
  knex: any,
  q: string,
  limit: number
): Promise<string[]> {
  const { rows } = await knex.raw(
    `select id
     from product
     where deleted_at is null
       and status = 'published'
       and word_similarity(?, title) > ${SIMILARITY_THRESHOLD}
     order by word_similarity(?, title) desc
     limit ?`,
    [q, q, limit]
  )
  return rows.map((r: { id: string }) => r.id)
}

export async function searchProductsFuzzy(
  query: any,
  knex: any,
  q: string,
  limit: number
): Promise<any[]> {
  const trimmed = q.trim()
  if (!trimmed) {
    return []
  }

  const ids = await findSimilarProductIds(knex, trimmed, limit)
  if (!ids.length) {
    return []
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: FUZZY_SEARCH_FIELDS,
    filters: { id: ids, status: "published" },
    context: {
      variants: { calculated_price: QueryContext({ currency_code: "xof" }) },
    },
  })

  const variantIds = products.flatMap((p: any) =>
    (p.variants ?? []).map((v: any) => v.id)
  )
  const availability = variantIds.length
    ? await getTotalVariantAvailability(query, { variant_ids: variantIds })
    : {}

  for (const product of products) {
    for (const variant of product.variants ?? []) {
      variant.availability = computeAvailability(
        variant,
        availability[variant.id]?.availability ?? null
      )
    }
  }

  // filters:{id:[...]} ne préserve pas l'ordre - le retrier par pertinence.
  const rank = new Map(ids.map((id, i) => [id, i]))
  return [...products].sort(
    (a: any, b: any) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
  )
}
