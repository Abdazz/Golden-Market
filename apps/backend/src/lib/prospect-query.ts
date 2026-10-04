import { getTotalVariantAvailability } from "@medusajs/framework/utils"
import { computeAvailability } from "./meta-catalog-mapping"

// Nom affiché et disponibilité des variantes suivies par les prospects.
// Partagé par la page Prospects et le tableau de bord.
export async function loadVariantSummaries(query: any, variantIds: string[]) {
  const titles: Record<string, string> = {}
  const availability: Record<string, boolean> = {}
  if (!variantIds.length) return { titles, availability }
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "title", "manage_inventory", "allow_backorder", "product.title", "product.handle"],
    filters: { id: variantIds },
  })
  const stock = await getTotalVariantAvailability(query, { variant_ids: variants.map((v: any) => v.id) })
  for (const v of variants) {
    // Variante unique de Medusa ("Default Title") : le nom du produit suffit.
    const generic = !v.title || ["Default Title", "Default variant"].includes(v.title)
    titles[v.id] = v.product?.title ? (generic ? v.product.title : `${v.product.title} - ${v.title}`) : v.title
    availability[v.id] = computeAvailability(v, stock[v.id]?.availability ?? null) === "in stock"
  }
  return { titles, availability }
}
