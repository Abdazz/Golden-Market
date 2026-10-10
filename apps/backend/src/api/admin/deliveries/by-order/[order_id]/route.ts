import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { amountsByType } from "../../../../../lib/delivery-rules"
import { DELIVERY_FIELDS, customerName, isPaid, itemsOf, loadOrders, outstandingOf, toTourLine } from "../../../../../lib/delivery-service-helpers"

// Tentatives de livraison d'une commande (encadré "Livraison" de la fiche
// commande), la plus récente d'abord.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const orderId = req.params.order_id
  const { data } = await query.graph({ entity: "delivery", fields: DELIVERY_FIELDS, filters: { order_id: orderId } })
  const { data: couriers } = await query.graph({ entity: "courier", fields: ["id", "name"] })
  const names = new Map(couriers.map((c: any) => [c.id, c.name]))
  const order = (await loadOrders(req.scope, [orderId])).get(orderId)
  const deliveries = [...data]
    .sort((a: any, b: any) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())
    .map((d: any) => toTourLine(d, order, names.get(d.courier_id) as string | undefined))
  res.json({
    deliveries,
    order: order
      ? {
          id: order.id,
          status: order.status,
          city: order.shipping_address?.city ?? null,
          address: order.shipping_address?.address_1 ?? null,
          customer_name: customerName(order),
          customer_phone: order.shipping_address?.phone ?? "",
          items: itemsOf(order),
          // Montant à encaisser proposé selon le type (modifiable avant de confier).
          amount_to_collect: amountsByType({ paid: isPaid(order), outstanding: outstandingOf(order) }),
        }
      : null,
  })
}
