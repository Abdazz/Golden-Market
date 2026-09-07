import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { searchProductsFuzzy } from "../../../lib/product-fuzzy-search"

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 20

/**
 * Recherche produit tolérante aux fautes de frappe (pg_trgm), utilisée par
 * le tool WhatsApp find_products. /store/products?q= de Medusa fait un
 * matching littéral sans marge d'erreur - une faute de frappe (y compris
 * générée par le modèle IA de l'agent en reformulant la requête) renvoie
 * zéro résultat. Voir HANDOFF.md 2026-09-07.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const q = typeof req.query.q === "string" ? req.query.q : ""
  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const products = await searchProductsFuzzy(query, knex, q, limit)

  res.status(200).json({ products, count: products.length })
}
