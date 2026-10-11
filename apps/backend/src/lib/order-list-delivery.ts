import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { defaultTypeForCity, type DeliveryType } from "./delivery-rules"

// Liste des commandes de l'admin : la colonne "Canal de vente" de Medusa (un
// seul canal chez Golden Market, donc sans intérêt) affiche le type de
// livraison à la place (2026-10-11, demandé par le propriétaire). Celui de la
// dernière livraison non annulée quand la commande est confiée, sinon celui
// prévu d'après la ville de livraison (même règle qu'à l'attribution).

export const DELIVERY_TYPE_COLUMN_LABELS: Record<DeliveryType, string> = {
  express: "Livraison Ouaga",
  expedition: "Expédition",
}

type DeliveryRow = { order_id: string; type: DeliveryType; status: string; assigned_at: string | Date }
type OrderCity = { id: string; shipping_address?: { city?: string | null } | null }

export const deliveryTypeByOrder = (
  orderIds: string[],
  deliveries: DeliveryRow[],
  orders: OrderCity[]
): Map<string, DeliveryType> => {
  const latest = new Map<string, DeliveryRow>()
  for (const delivery of deliveries) {
    if (delivery.status === "canceled") continue
    const current = latest.get(delivery.order_id)
    if (!current || new Date(delivery.assigned_at) > new Date(current.assigned_at)) latest.set(delivery.order_id, delivery)
  }
  const cities = new Map(orders.map((order) => [order.id, order.shipping_address?.city]))
  return new Map(
    orderIds.map((id) => [id, latest.get(id)?.type ?? defaultTypeForCity(cities.get(id))] as const)
  )
}

export const withDeliveryTypeAsSalesChannel = (body: any, types: Map<string, DeliveryType>) => {
  if (!body || !Array.isArray(body.orders)) return body
  for (const order of body.orders as { id: string; sales_channel?: Record<string, unknown> | null }[]) {
    const type = types.get(order.id)
    if (!type) continue
    order.sales_channel = { ...(order.sales_channel ?? {}), name: DELIVERY_TYPE_COLUMN_LABELS[type] }
  }
  return body
}

export const addDeliveryTypes = async (scope: any, body: any) => {
  if (!body || !Array.isArray(body.orders) || !body.orders.length) return body
  const orderIds = body.orders.map((order: { id: string }) => order.id)
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const [{ data: deliveries }, { data: orders }] = await Promise.all([
    query.graph({
      entity: "delivery",
      fields: ["order_id", "type", "status", "assigned_at"],
      filters: { order_id: orderIds },
    }),
    query.graph({ entity: "order", fields: ["id", "shipping_address.city"], filters: { id: orderIds } }),
  ])
  return withDeliveryTypeAsSalesChannel(body, deliveryTypeByOrder(orderIds, deliveries, orders))
}
