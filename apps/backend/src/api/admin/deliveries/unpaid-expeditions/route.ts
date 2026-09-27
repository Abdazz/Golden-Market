import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { customerName, isPaid, loadOrders, outstandingOf } from "../../../../lib/delivery-service-helpers"
import { orderNumberOf } from "../../../../lib/order-number"

// Expéditions déposées à la gare dont la commande n'est pas encore payée
// (paiement Orange/Moov Money attendu après l'envoi).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: shipped } = await query.graph({
    entity: "delivery",
    fields: ["id", "order_id", "destination_city", "transport_company", "completed_at"],
    filters: { type: "expedition", status: "shipped" },
  })
  const orders = await loadOrders(
    req.scope,
    shipped.map((d: any) => d.order_id)
  )
  const lines = shipped
    .map((d: any) => ({ d, o: orders.get(d.order_id) }))
    .filter(({ o }) => o && o.status !== "canceled" && !isPaid(o))
    .sort((a, b) => new Date(a.d.completed_at).getTime() - new Date(b.d.completed_at).getTime())
    .map(({ d, o }) => ({
      order_id: d.order_id,
      order_number: orderNumberOf(o),
      customer_name: customerName(o),
      customer_phone: o.shipping_address?.phone ?? "",
      transport_company: d.transport_company,
      destination_city: d.destination_city,
      shipped_at: d.completed_at,
      total: o.total,
      outstanding: outstandingOf(o),
    }))
  res.json({ lines })
}
