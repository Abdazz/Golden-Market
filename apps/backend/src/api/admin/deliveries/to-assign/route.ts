import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ORDER_FIELDS, customerName, isPaid, isShippedOrDelivered } from "../../../../lib/delivery-service-helpers"
import { orderNumberOf } from "../../../../lib/order-number"

// Commandes à confier : non annulées, pas encore livrées ni expédiées, sans
// livraison en cours (y compris les échecs "à relivrer"). 200 plus récentes.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: { status: { $nin: ["canceled", "draft", "archived"] } },
    pagination: { take: 200, order: { created_at: "DESC" } },
  })
  const { data: deliveries } = await query.graph({
    entity: "delivery",
    fields: ["id", "order_id", "status", "redeliver", "assigned_at"],
    filters: { order_id: orders.map((o: any) => o.id) },
  })
  const byOrder = new Map<string, any[]>()
  for (const d of deliveries) byOrder.set(d.order_id, [...(byOrder.get(d.order_id) ?? []), d])

  const result = orders
    .filter((o: any) => !isShippedOrDelivered(o))
    .filter((o: any) => !(byOrder.get(o.id) ?? []).some((d) => ["assigned", "delivered", "shipped"].includes(d.status)))
    .map((o: any) => {
      const last = (byOrder.get(o.id) ?? []).sort(
        (a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()
      )[0]
      return {
        id: o.id,
        order_number: orderNumberOf(o),
        created_at: o.created_at,
        customer_name: customerName(o),
        customer_phone: o.shipping_address?.phone ?? "",
        city: o.shipping_address?.city ?? null,
        address: o.shipping_address?.address_1 ?? null,
        total: o.total,
        paid: isPaid(o),
        redeliver: Boolean(last && last.status === "failed" && last.redeliver),
        last_failure: last && last.status === "failed" ? last.status : null,
      }
    })
  res.json({ orders: result })
}
