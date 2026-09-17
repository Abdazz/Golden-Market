import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  QueryContext,
  getTotalVariantAvailability,
} from "@medusajs/framework/utils"
import { embedText } from "../../../lib/product-embedding-client"
import { findNearestProductIds } from "../../../lib/product-embedding-store"
import { computeAvailability } from "../../../lib/meta-catalog-mapping"

const DEFAULT_LIMIT = 8
const MAX_LIMIT = 15

const SEARCH_FIELDS = [
  "id",
  "title",
  "handle",
  "variants.id",
  "variants.calculated_price.calculated_amount",
  "variants.calculated_price.currency_code",
  "variants.manage_inventory",
  "variants.allow_backorder",
]

type SearchProduct = {
  id: string
  title: string
  handle: string
  variants: Array<{
    id: string
    manage_inventory: boolean
    allow_backorder: boolean
    calculated_price?: { calculated_amount: number; currency_code: string }
    availability?: string
  }>
}

/**
 * Recherche vectorielle de repli pour l'agent WhatsApp - troisième niveau
 * après find_products (pg_trgm) et avant browse_catalog (dernier recours).
 * Voir docs/superpowers/specs/2026-09-17-recherche-semantique-produits-design.md.
 * Pas de seuil de similarité codé en dur : renvoie toujours le top-K, laisse
 * le modèle IA juger de la pertinence parmi les candidats.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const apiKey = process.env.OPENAI_API_KEY
  const q = typeof req.query.q === "string" ? req.query.q : ""
  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT)

  if (!apiKey) {
    res
      .status(503)
      .json({ message: "Recherche sémantique non configurée (OPENAI_API_KEY manquante)" })
    return
  }

  if (!q) {
    res.status(400).json({ message: "Paramètre q requis" })
    return
  }

  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const embedding = await embedText(q, apiKey)
  const productIds = await findNearestProductIds(pg, { embedding, limit })

  if (productIds.length === 0) {
    res.status(200).json({ products: [], count: 0 })
    return
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: SEARCH_FIELDS,
    filters: { id: productIds, status: "published" },
    context: {
      variants: { calculated_price: QueryContext({ currency_code: "xof" }) },
    },
  })

  const typedProducts = products as unknown as SearchProduct[]

  const allVariantIds = typedProducts.flatMap((p) => p.variants.map((v) => v.id))
  const availability = allVariantIds.length
    ? await getTotalVariantAvailability(query, { variant_ids: allVariantIds })
    : {}

  for (const product of typedProducts) {
    for (const variant of product.variants) {
      variant.availability = computeAvailability(
        variant,
        availability[variant.id]?.availability ?? null
      )
    }
  }

  // Préserve l'ordre de pertinence pgvector - query.graph ne le garantit pas.
  const orderedProducts = productIds
    .map((id) => typedProducts.find((p) => p.id === id))
    .filter((p): p is SearchProduct => !!p)

  res.status(200).json({ products: orderedProducts, count: orderedProducts.length })
}
