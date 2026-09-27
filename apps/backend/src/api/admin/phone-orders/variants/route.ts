import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  QueryContext,
  getTotalVariantAvailability,
} from "@medusajs/framework/utils"
import { computeAvailability } from "../../../../lib/meta-catalog-mapping"

// Recherche d'articles pour le formulaire "Nouvelle commande" : une ligne par
// variante (option), avec le prix réellement appliqué (promo comprise) et la
// disponibilité - mêmes calculs que le site et l'agent WhatsApp.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const q = String(req.query.q ?? "").trim()
  if (q.length < 2) {
    res.json({ variants: [] })
    return
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code", "countries.iso_2"],
  })
  const region = regions.find((r: any) => (r.countries ?? []).some((c: any) => c.iso_2 === "bf"))

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "thumbnail",
      "variants.id",
      "variants.title",
      "variants.manage_inventory",
      "variants.allow_backorder",
      "variants.calculated_price.calculated_amount",
      "variants.calculated_price.original_amount",
    ],
    filters: { status: "published", title: { $ilike: `%${q}%` } },
    pagination: { take: 10 },
    context: {
      variants: {
        calculated_price: QueryContext({ region_id: region?.id, currency_code: region?.currency_code ?? "xof" }),
      },
    },
  })

  const variantIds = products.flatMap((p: any) => (p.variants ?? []).map((v: any) => v.id))
  const availability = variantIds.length
    ? await getTotalVariantAvailability(query, { variant_ids: variantIds })
    : {}

  res.json({
    variants: products.flatMap((p: any) =>
      (p.variants ?? []).map((v: any) => ({
        variant_id: v.id,
        product_title: p.title,
        variant_title: (p.variants ?? []).length > 1 ? v.title : null,
        thumbnail: p.thumbnail,
        price: v.calculated_price?.calculated_amount ?? null,
        original_price: v.calculated_price?.original_amount ?? null,
        in_stock: computeAvailability(v, availability[v.id]?.availability ?? null) === "in stock",
      }))
    ),
  })
}
