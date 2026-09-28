import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { monthOf } from "../../../lib/cashbook-rules"
import { margin } from "../../../lib/procurement-rules"
import { loadVariantInfos } from "../../../lib/procurement-query"
import { CASHBOOK_MODULE } from "../../../modules/cashbook"
import { PROCUREMENT_MODULE } from "../../../modules/procurement"

// Marges (spec 2026-09-28 approvisionnement-marges) : par variante (coût de
// revient courant, prix de vente, marge) et marge brute du mois sur les
// commandes encaissées ce mois-là (ventes du journal de caisse).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const requested = String(req.query.month ?? "")
  const month = /^\d{4}-\d{2}$/.test(requested) ? requested : monthOf(new Date())
  const infos = await loadVariantInfos(req.scope)
  const procurement = req.scope.resolve(PROCUREMENT_MODULE) as any
  const costs = new Map<string, number>(
    (await procurement.listVariantCosts({})).map((c: any) => [c.variant_id, c.unit_cost_xof])
  )

  const variants = [...infos.entries()]
    .map(([variant_id, info]) => {
      const unitCost = costs.get(variant_id) ?? null
      const m = margin(unitCost, info.price)
      return { variant_id, ...info, unit_cost_xof: unitCost, margin_xof: m.unit, margin_percent: m.percent }
    })
    .sort((a, b) => (a.product_title + (a.variant_title ?? "")).localeCompare(b.product_title + (b.variant_title ?? ""), "fr"))

  // Commandes encaissées dans le mois (écritures "Vente" du journal).
  const cashbook = req.scope.resolve(CASHBOOK_MODULE) as any
  const sales = (await cashbook.listCashEntries({ category: "sale" })).filter(
    (e: any) => e.order_id && monthOf(e.date) === month
  )
  const orderIds = [...new Set(sales.map((e: any) => e.order_id))] as string[]
  let revenue = 0
  let cost = 0
  let unknownCostItems = 0
  if (orderIds.length) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({ entity: "order", fields: ["id", "status", "items.*"], filters: { id: orderIds } })
    for (const order of orders.filter((o: any) => o.status !== "canceled")) {
      for (const item of (order.items ?? []) as any[]) {
        if (!item?.variant_id) continue
        const unitCost = costs.get(item.variant_id)
        if (unitCost === undefined) {
          unknownCostItems += Number(item.quantity)
          continue
        }
        revenue += Number(item.unit_price) * Number(item.quantity)
        cost += unitCost * Number(item.quantity)
      }
    }
  }

  res.json({
    month,
    variants,
    month_margin: { revenue, cost, margin: revenue - cost, orders: orderIds.length, unknown_cost_items: unknownCostItems },
  })
}
