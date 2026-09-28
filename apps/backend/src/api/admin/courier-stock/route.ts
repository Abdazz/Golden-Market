import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { loadStockItems } from "../../../lib/courier-stock-query"
import { balances, courierTotals } from "../../../lib/courier-stock-rules"

// Vue d'ensemble : au dépôt (calculé) / chez chaque livreur / total possédé.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: movements } = await query.graph({
    entity: "courier_stock_movement",
    fields: ["courier_id", "inventory_item_id", "quantity"],
  })
  const b = balances(movements)
  const totals = courierTotals(b)
  const { data: couriers } = await query.graph({ entity: "courier", fields: ["id", "name", "active"] })
  const shown = couriers.filter((c: any) => c.active || b[c.id])
  const { items } = await loadStockItems(query)
  const rows = items
    .map((i) => ({
      id: i.id,
      label: i.label,
      stocked: i.stocked,
      warehouse: i.stocked - (totals[i.id] ?? 0),
      total_couriers: totals[i.id] ?? 0,
      by_courier: Object.fromEntries(shown.map((c: any) => [c.id, b[c.id]?.[i.id] ?? 0])),
    }))
    .sort((x, y) => Number(y.total_couriers > 0) - Number(x.total_couriers > 0) || x.label.localeCompare(y.label, "fr"))
  res.json({ couriers: shown.map((c: any) => ({ id: c.id, name: c.name })), items: rows })
}
