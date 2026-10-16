import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { unremittedDays } from "../../../../lib/dashboard-rules"
import { DELIVERY_FIELDS, loadOrders, toTourLine } from "../../../../lib/delivery-service-helpers"

// Argent à récupérer chez les livreurs : mêmes journées que la carte du tableau
// de bord (journées terminées sans versement validé), avec les livraisons de
// chaque journée pour le détail.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: deliveries } = await query.graph({
    entity: "delivery",
    fields: DELIVERY_FIELDS,
    filters: { status: ["delivered", "failed", "shipped"] },
  })
  const { data: settlements } = await query.graph({ entity: "courier_settlement", fields: ["courier_id", "day"] })
  const { data: couriers } = await query.graph({ entity: "courier", fields: ["id", "name"] })
  const names = new Map<string, string>(couriers.map((c: any) => [c.id, c.name]))

  const groups = unremittedDays(deliveries, settlements)
  const orders = await loadOrders(
    req.scope,
    groups.flatMap((g) => g.deliveries.map((d) => d.order_id))
  )

  const byCourier = new Map<string, { id: string; name: string; amount: number; days: any[] }>()
  for (const g of groups) {
    const entry = byCourier.get(g.courier_id) ?? {
      id: g.courier_id,
      name: names.get(g.courier_id) ?? "Livreur supprimé",
      amount: 0,
      days: [],
    }
    entry.amount += g.settlement.toRemit
    entry.days.push({
      day: g.day,
      to_remit: g.settlement.toRemit,
      collected: g.settlement.collected,
      courier_fees: g.settlement.courierFees,
      transport_fees: g.settlement.transportFees,
      lines: g.deliveries
        .map((d) => toTourLine(d, orders.get(d.order_id), entry.name)),
    })
    byCourier.set(g.courier_id, entry)
  }
  const list = [...byCourier.values()].sort((a, b) => b.amount - a.amount)
  for (const c of list) c.days.sort((a, b) => a.day.localeCompare(b.day))
  res.json({ total: list.reduce((s, c) => s + c.amount, 0), couriers: list })
}
