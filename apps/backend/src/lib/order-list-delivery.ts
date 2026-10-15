import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { defaultTypeForCity, type DeliveryType } from "./delivery-rules"

// Liste des commandes de l'admin (2026-10-11, demandé par le propriétaire) :
// la colonne "Canal de vente" de Medusa (un seul canal chez Golden Market,
// donc sans intérêt) devient "Livraison" (type de livraison), et une colonne
// "Livreur" est ajoutée par scripts/patch-dashboard.mjs (order.courier_name).
// Type et livreur de la dernière livraison non annulée quand la commande est
// confiée ; sinon le type prévu d'après la ville de livraison (même règle qu'à
// l'attribution), sans livreur.

export const DELIVERY_TYPE_COLUMN_LABELS: Record<DeliveryType, string> = {
  express: "Livraison Ouaga",
  expedition: "Expédition",
}

type DeliveryRow = {
  order_id: string
  courier_id: string
  type: DeliveryType
  status: string
  assigned_at: string | Date
}
type OrderCity = { id: string; shipping_address?: { city?: string | null } | null }
export type OrderDeliveryInfo = { type: DeliveryType; courierId: string | null }

export const deliveryInfoByOrder = (
  orderIds: string[],
  deliveries: DeliveryRow[],
  orders: OrderCity[]
): Map<string, OrderDeliveryInfo> => {
  const latest = new Map<string, DeliveryRow>()
  for (const delivery of deliveries) {
    if (delivery.status === "canceled") continue
    const current = latest.get(delivery.order_id)
    if (!current || new Date(delivery.assigned_at) > new Date(current.assigned_at)) latest.set(delivery.order_id, delivery)
  }
  const cities = new Map(orders.map((order) => [order.id, order.shipping_address?.city]))
  return new Map(
    orderIds.map((id) => {
      const delivery = latest.get(id)
      const info: OrderDeliveryInfo = delivery
        ? { type: delivery.type, courierId: delivery.courier_id }
        : { type: defaultTypeForCity(cities.get(id)), courierId: null }
      return [id, info] as const
    })
  )
}

export const withDeliveryAsSalesChannel = (
  body: any,
  infos: Map<string, OrderDeliveryInfo>,
  courierNames: Map<string, string>
) => {
  if (!body || !Array.isArray(body.orders)) return body
  for (const order of body.orders as {
    id: string
    sales_channel?: Record<string, unknown> | null
    courier_name?: string | null
  }[]) {
    const info = infos.get(order.id)
    if (!info) continue
    order.sales_channel = { ...(order.sales_channel ?? {}), name: DELIVERY_TYPE_COLUMN_LABELS[info.type] }
    order.courier_name = (info.courierId && courierNames.get(info.courierId)) || null
  }
  return body
}

export const addDeliveryColumn = async (scope: any, body: any) => {
  if (!body || !Array.isArray(body.orders) || !body.orders.length) return body
  const orderIds = body.orders.map((order: { id: string }) => order.id)
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const [{ data: deliveries }, { data: orders }] = await Promise.all([
    query.graph({
      entity: "delivery",
      fields: ["order_id", "courier_id", "type", "status", "assigned_at"],
      filters: { order_id: orderIds },
    }),
    query.graph({ entity: "order", fields: ["id", "metadata", "shipping_address.city"], filters: { id: orderIds } }),
  ])
  // Commandes supprimées (annulées et masquées, lib/order-delete.ts) : retirées de la liste.
  const hidden = new Set(orders.filter((o: any) => o.metadata?.deleted_at).map((o: any) => o.id))
  if (hidden.size) {
    body.orders = body.orders.filter((o: { id: string }) => !hidden.has(o.id))
    if (typeof body.count === "number") body.count -= hidden.size
  }
  const infos = deliveryInfoByOrder(orderIds, deliveries, orders)
  const courierIds = [...new Set([...infos.values()].map((info) => info.courierId).filter(Boolean))] as string[]
  const { data: couriers } = courierIds.length
    ? await query.graph({ entity: "courier", fields: ["id", "name"], filters: { id: courierIds } })
    : { data: [] }
  const courierNames = new Map<string, string>(couriers.map((c: { id: string; name: string }) => [c.id, c.name]))
  return withDeliveryAsSalesChannel(body, infos, courierNames)
}
