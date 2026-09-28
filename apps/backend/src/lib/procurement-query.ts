import { ContainerRegistrationKeys, QueryContext } from "@medusajs/framework/utils"
import { lineCosts } from "./procurement-rules"

// Lectures partagées de l'approvisionnement et des marges (spec 2026-09-28
// approvisionnement-marges).

export type VariantInfo = { product_title: string; variant_title: string | null; price: number | null }

// Prix appliqué (promotion comprise) de chaque variante des produits publiés,
// région Burkina Faso - mêmes calculs que le site.
export async function loadVariantInfos(scope: { resolve: (key: string) => any }): Promise<Map<string, VariantInfo>> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: regions } = await query.graph({ entity: "region", fields: ["id", "currency_code", "countries.iso_2"] })
  const region = regions.find((r: any) => (r.countries ?? []).some((c: any) => c.iso_2 === "bf"))
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "variants.id", "variants.title", "variants.calculated_price.calculated_amount"],
    filters: { status: "published" },
    context: {
      variants: {
        calculated_price: QueryContext({ region_id: region?.id, currency_code: region?.currency_code ?? "xof" }),
      },
    },
  })
  const map = new Map<string, VariantInfo>()
  for (const p of products) {
    for (const v of p.variants ?? []) {
      map.set(v.id, {
        product_title: p.title,
        variant_title: (p.variants ?? []).length > 1 ? v.title : null,
        price: v.calculated_price?.calculated_amount ?? null,
      })
    }
  }
  return map
}

// Commande fournisseur avec les calculs de chaque ligne et ses totaux.
export const withCosts = (order: any, infos?: Map<string, VariantInfo>) => {
  const lines = (order.lines ?? []).map((line: any) => {
    const costs = lineCosts(line, order)
    const price = infos?.get(line.variant_id)?.price ?? null
    const unitCost = line.unit_cost_xof ?? costs.unitCost
    return {
      ...line,
      purchase_usd: costs.purchaseUsd,
      cost_total_xof: costs.costTotal,
      unit_cost_xof: unitCost,
      cash_out_xof: costs.cashOut,
      price_xof: price,
      margin_xof: price !== null ? price - unitCost : null,
    }
  })
  return {
    ...order,
    lines,
    totals: {
      quantity: lines.reduce((s: number, l: any) => s + l.quantity, 0),
      cost_total_xof: lines.reduce((s: number, l: any) => s + l.cost_total_xof, 0),
      cash_out_xof: lines.reduce((s: number, l: any) => s + l.cash_out_xof, 0),
    },
  }
}
