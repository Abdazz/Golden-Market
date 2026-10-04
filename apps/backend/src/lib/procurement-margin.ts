import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { monthOf } from "./cashbook-rules"
import { CASHBOOK_MODULE } from "../modules/cashbook"
import { PROCUREMENT_MODULE } from "../modules/procurement"

type Scope = { resolve: (key: string) => any }

// Coût de revient courant de chaque variante (onglet Marges).
export async function loadVariantCosts(scope: Scope): Promise<Map<string, number>> {
  const procurement = scope.resolve(PROCUREMENT_MODULE) as any
  return new Map<string, number>(
    (await procurement.listVariantCosts({})).map((c: any) => [c.variant_id, c.unit_cost_xof])
  )
}

// Marge brute du mois sur les commandes encaissées ce mois-là (ventes du
// journal de caisse). Partagé par l'onglet Marges et le tableau de bord.
export async function computeMonthMargin(scope: Scope, month: string, costs: Map<string, number>) {
  const cashbook = scope.resolve(CASHBOOK_MODULE) as any
  const sales = (await cashbook.listCashEntries({ category: "sale" })).filter(
    (e: any) => e.order_id && monthOf(e.date) === month
  )
  const orderIds = [...new Set(sales.map((e: any) => e.order_id))] as string[]
  let revenue = 0
  let cost = 0
  let unknownCostItems = 0
  if (orderIds.length) {
    const query = scope.resolve(ContainerRegistrationKeys.QUERY)
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
  return { revenue, cost, margin: revenue - cost, orders: orderIds.length, unknown_cost_items: unknownCostItems }
}
