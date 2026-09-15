import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { listAllProducts } from "../../../lib/product-fuzzy-search"

const DEFAULT_LIMIT = 60
const MAX_LIMIT = 100

/**
 * Liste tout le catalogue publié (titre, prix, disponibilité), sans filtre de
 * recherche. Utilisée par le tool WhatsApp `browse_catalog` en dernier
 * recours quand /store/products-fuzzy-search ne trouve rien après un second
 * essai : le client décrit peut-être le produit avec des mots sans proximité
 * orthographique avec le titre catalogue (synonyme, faute de frappe
 * phonétique) - hors scope de la tolérance aux fautes de pg_trgm. Voir
 * HANDOFF.md 2026-09-15.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const products = await listAllProducts(query, knex, limit)

  res.status(200).json({ products, count: products.length })
}
