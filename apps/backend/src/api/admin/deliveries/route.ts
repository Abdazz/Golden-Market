import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { computeAmountToCollect, defaultTypeForCity } from "../../../lib/delivery-rules"
import { isPaid, loadOrders, notifyCourier, outstandingOf } from "../../../lib/delivery-service-helpers"
import { orderNumberOf } from "../../../lib/order-number"
import { assignDeliveryWorkflow } from "../../../workflows/assign-delivery"
import type { AssignDeliveriesSchema } from "./middlewares"

// Confier une ou plusieurs commandes à un livreur. Un workflow par commande :
// une commande refusée (déjà confiée, annulée) n'empêche pas les autres.
export async function POST(req: AuthenticatedMedusaRequest<AssignDeliveriesSchema>, res: MedusaResponse) {
  const body = req.validatedBody
  const orders = await loadOrders(req.scope, body.order_ids)
  const deliveries: { id: string; order_id: string; whatsapp_status: string; whatsapp_error: string | null }[] = []
  const errors: { order_id: string; message: string }[] = []

  for (const orderId of body.order_ids) {
    const order = orders.get(orderId)
    if (!order) {
      errors.push({ order_id: orderId, message: "Commande introuvable." })
      continue
    }
    const type = body.type ?? defaultTypeForCity(order.shipping_address?.city)
    try {
      const { result } = await assignDeliveryWorkflow(req.scope).run({
        input: {
          order_id: orderId,
          courier_id: body.courier_id,
          type,
          address: type === "express" ? body.address ?? order.shipping_address?.address_1 ?? null : null,
          transport_company: type === "expedition" ? body.transport_company ?? null : null,
          destination_city:
            type === "expedition" ? body.destination_city ?? order.shipping_address?.city ?? null : null,
          amount_to_collect: computeAmountToCollect({
            type,
            paymentStatus: isPaid(order) ? "captured" : "not_paid",
            outstanding: outstandingOf(order),
          }),
          order_canceled: order.status === "canceled",
        },
      })
      const sent = await notifyCourier(req.scope, result.id)
      deliveries.push({ id: result.id, order_id: orderId, ...sent })
    } catch (error) {
      errors.push({ order_id: orderId, message: `Commande ${orderNumberOf(order)} : ${(error as Error).message}` })
    }
  }

  res.json({ deliveries, errors })
}
