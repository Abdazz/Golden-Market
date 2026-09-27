import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { computeSettlement, todayInOuaga } from "../../../../lib/delivery-rules"
import { DELIVERY_FIELDS, loadOrders, toTourLine } from "../../../../lib/delivery-service-helpers"
import { updateDeliveryWorkflow } from "../../../../workflows/update-delivery"

// Tournée d'un livreur pour un jour : livraisons prévues ce jour-là plus
// livraisons terminées ce jour-là, montant à reverser et versement validé.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const courierId = String(req.query.courier_id ?? "")
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? "")) ? String(req.query.date) : todayInOuaga()
  if (!courierId) {
    res.status(400).json({ message: "Choisissez un livreur." })
    return
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const start = new Date(`${date}T00:00:00Z`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  const { data: planned } = await query.graph({
    entity: "delivery",
    fields: DELIVERY_FIELDS,
    filters: { courier_id: courierId, tour_date: date },
  })
  const { data: completed } = await query.graph({
    entity: "delivery",
    fields: DELIVERY_FIELDS,
    filters: { courier_id: courierId, completed_at: { $gte: start, $lt: end } },
  })
  const byId = new Map<string, any>()
  for (const d of [...planned, ...completed]) byId.set(d.id, d)
  const deliveries = [...byId.values()]
  const orders = await loadOrders(
    req.scope,
    deliveries.map((d) => d.order_id)
  )

  // Commande annulée après attribution : la ligne passe "Annulée", rien à encaisser.
  const canceled = deliveries.filter((d) => d.status === "assigned" && orders.get(d.order_id)?.status === "canceled")
  if (canceled.length) {
    await updateDeliveryWorkflow(req.scope).run({ input: canceled.map((d) => ({ id: d.id, status: "canceled" })) })
    canceled.forEach((d) => (d.status = "canceled"))
  }

  const lines = deliveries
    .sort((a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime())
    .map((d) => toTourLine(d, orders.get(d.order_id)))
  const {
    data: [validated],
  } = await query.graph({
    entity: "courier_settlement",
    fields: ["id", "expected_amount", "received_amount", "validated_at", "note"],
    filters: { courier_id: courierId, day: date },
  })

  res.json({ date, lines, settlement: computeSettlement(deliveries, date), validated: validated ?? null })
}
