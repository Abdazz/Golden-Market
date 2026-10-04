import { computeShippingFee } from "./shipping-fee-rules"
import { defaultTypeForCity } from "./delivery-rules"

// Lecture des frais d'expédition des produits d'un panier / d'une commande
// (spec 2026-10-04 frais-expedition-par-produit).
type GraphQuery = { graph: (config: any) => Promise<{ data: any[] }> }

export async function shippingFeeForProducts(query: GraphQuery, city: string | null | undefined, productIds: string[]) {
  const ids = [...new Set(productIds.filter(Boolean))]
  if (!ids.length || defaultTypeForCity(city) === "express") return 0
  const { data } = await query.graph({ entity: "product", fields: ["id", "metadata"], filters: { id: ids } })
  return computeShippingFee({ city, products: data })
}

export async function shippingFeeForVariants(query: GraphQuery, city: string | null | undefined, variantIds: string[]) {
  const ids = [...new Set(variantIds.filter(Boolean))]
  if (!ids.length || defaultTypeForCity(city) === "express") return 0
  const { data } = await query.graph({ entity: "product_variant", fields: ["id", "product.id", "product.metadata"], filters: { id: ids } })
  return computeShippingFee({ city, products: data.map((v: any) => v.product ?? {}) })
}
