import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadProductPrices, parsePriceInput, saveVariantPrices } from "../../../../lib/product-prices"

// Prix standard / promotionnel / de gros des variantes d'un produit (widget
// « Prix » de la fiche produit). GET : lecture. POST { variant_id, standard,
// promo, wholesale } : enregistre les trois prix d'une variante.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json({ variants: await loadProductPrices(req.scope, req.params.id) })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as any
  const input = parsePriceInput(body)
  if (typeof input === "string") return res.status(400).json({ message: input })
  const owned = (await loadProductPrices(req.scope, req.params.id)).some((v) => v.variant_id === body.variant_id)
  if (!owned) return res.status(404).json({ message: "Variante introuvable pour ce produit." })
  const error = await saveVariantPrices(req.scope, body.variant_id, input)
  if (error) return res.status(400).json({ message: error })
  res.json({ variants: await loadProductPrices(req.scope, req.params.id) })
}
