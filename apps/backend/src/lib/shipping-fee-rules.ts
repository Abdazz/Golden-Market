import { defaultTypeForCity } from "./delivery-rules"

// Frais d'expédition (spec 2026-10-04 frais-expedition-par-produit) :
// gratuits à Ouagadougou ; ailleurs, un seul colis -> les frais les plus
// élevés des produits du panier, 1 500 F pour un produit sans frais saisis.

export const DEFAULT_SHIPPING_FEE_XOF = 1500
export const SHIPPING_FEE_METADATA_KEY = "frais_expedition_xof"

export const productShippingFee = (metadata: Record<string, unknown> | null | undefined): number => {
  const raw = metadata?.[SHIPPING_FEE_METADATA_KEY]
  const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_SHIPPING_FEE_XOF
}

export const computeShippingFee = (input: {
  city: string | null | undefined
  products: { metadata?: Record<string, unknown> | null }[]
}): number => {
  if (defaultTypeForCity(input.city) === "express" || !input.products.length) return 0
  return Math.max(...input.products.map((p) => productShippingFee(p.metadata)))
}
