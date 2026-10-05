import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { defaultTypeForCity } from "../../../../lib/delivery-rules"
import { shippingFeeForVariants } from "../../../../lib/shipping-fee-query"

// Frais d'expédition affichés dans le formulaire "Nouvelle commande" : même
// calcul qu'à la création de la commande (spec 2026-10-06).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const city = typeof req.query.city === "string" ? req.query.city : ""
  const raw = typeof req.query.variant_ids === "string" ? req.query.variant_ids : ""
  const variantIds = raw.split(",").map((id) => id.trim()).filter(Boolean)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  // free : livraison gratuite pour la ville (distinct d'un montant nul).
  const free = defaultTypeForCity(city) === "express"
  res.json({ amount: await shippingFeeForVariants(query, city, variantIds), free })
}
