import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { buildCourierMessageParams, sendCourierMessage } from "./delivery-message"
import { orderNumberOf } from "./order-number"
import { updateDeliveryWorkflow } from "../workflows/update-delivery"

// Lectures partagées par les routes admin des livraisons (commande, lignes de
// tournée) et envoi du message WhatsApp au livreur.

export const ORDER_FIELDS = [
  "id",
  "display_id",
  "custom_display_id",
  "version",
  "status",
  "total",
  "created_at",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.phone",
  "shipping_address.address_1",
  "shipping_address.city",
  // Articles, livraison et récapitulatif chargés en entier : avec des champs
  // choisis un à un (items.quantity, summary.pending_difference...), Medusa
  // renvoie total 0 et quantités vides (constaté en local le 2026-09-27).
  "items.*",
  "shipping_methods.*",
  "summary.*",
  "fulfillments.id",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
]

// payment_status / fulfillment_status ne sont calculés que par les routes
// natives de l'admin, pas par query.graph : on les déduit ici.
export const outstandingOf = (o: any): number => Math.max(0, Number(o?.summary?.pending_difference ?? o?.total ?? 0))
export const isPaid = (o: any): boolean => Number(o?.total ?? 0) > 0 && outstandingOf(o) === 0
export const isShippedOrDelivered = (o: any): boolean =>
  (o?.fulfillments ?? []).some((f: any) => !f.canceled_at && (f.shipped_at || f.delivered_at))

export const DELIVERY_FIELDS = [
  "id",
  "order_id",
  "courier_id",
  "tour_date",
  "first_tour_date",
  "postponed_count",
  "assigned_at",
  "completed_at",
  "type",
  "status",
  "address",
  "transport_company",
  "destination_city",
  "failure_reason",
  "redeliver",
  "amount_to_collect",
  "amount_collected",
  "courier_fee",
  "transport_fee",
  "whatsapp_status",
  "whatsapp_error",
  "sync_warning",
]

export async function loadOrders(scope: any, ids: string[]): Promise<Map<string, any>> {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Map()
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: ORDER_FIELDS, filters: { id: unique } })
  return new Map(data.map((o: any) => [o.id, o]))
}

export const customerName = (o: any): string =>
  [o?.shipping_address?.first_name, o?.shipping_address?.last_name].filter(Boolean).join(" ") || "Client"

export const itemsOf = (o: any): { title: string; quantity: number }[] =>
  (o?.items ?? []).map((i: any) => ({
    title:
      i.variant_title && i.variant_title !== "Default Title" && i.variant_title !== i.product_title
        ? `${i.product_title} (${i.variant_title})`
        : i.product_title,
    quantity: Number(i.quantity),
  }))

export const placeOf = (d: any): string =>
  d.type === "expedition" ? `${d.transport_company ?? ""} → ${d.destination_city ?? ""}` : d.address ?? ""

export const toTourLine = (d: any, o: any, courierName?: string) => ({
  id: d.id,
  order_id: d.order_id,
  order_number: o ? orderNumberOf(o) : d.order_id,
  courier_id: d.courier_id,
  courier_name: courierName ?? null,
  customer_name: customerName(o),
  customer_phone: o?.shipping_address?.phone ?? "",
  place: placeOf(d),
  items: itemsOf(o),
  type: d.type,
  status: d.status,
  order_canceled: o?.status === "canceled",
  tour_date: d.tour_date,
  postponed_from: d.postponed_count > 0 ? d.first_tour_date : null,
  assigned_at: d.assigned_at,
  completed_at: d.completed_at,
  amount_to_collect: d.amount_to_collect,
  amount_collected: d.amount_collected,
  courier_fee: d.courier_fee,
  transport_fee: d.transport_fee,
  failure_reason: d.failure_reason,
  redeliver: d.redeliver,
  whatsapp_status: d.whatsapp_status,
  whatsapp_error: d.whatsapp_error,
  sync_warning: d.sync_warning,
})

// Envoie (ou renvoie) le détail de la livraison au livreur et enregistre le
// résultat sur la livraison. Ne lève jamais : un échec d'envoi n'annule pas
// l'attribution, l'admin affiche l'erreur et le bouton "Renvoyer le message".
export async function notifyCourier(scope: any, deliveryId: string) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  let result: { ok: true } | { ok: false; error: string }
  try {
    const {
      data: [delivery],
    } = await query.graph({ entity: "delivery", fields: DELIVERY_FIELDS, filters: { id: deliveryId } })
    const {
      data: [courier],
    } = await query.graph({ entity: "courier", fields: ["id", "phone"], filters: { id: delivery.courier_id } })
    const order = (await loadOrders(scope, [delivery.order_id])).get(delivery.order_id)
    result = await sendCourierMessage({
      phone: courier.phone,
      params: buildCourierMessageParams({
        orderNumber: order ? orderNumberOf(order) : delivery.order_id,
        customerName: customerName(order),
        customerPhone: order?.shipping_address?.phone ?? "",
        type: delivery.type,
        address: delivery.address,
        transportCompany: delivery.transport_company,
        destinationCity: delivery.destination_city,
        items: itemsOf(order),
        amountToCollect: delivery.amount_to_collect,
      }),
    })
  } catch (error) {
    result = { ok: false, error: (error as Error).message }
  }
  const changes = result.ok
    ? { id: deliveryId, whatsapp_status: "sent", whatsapp_error: null }
    : { id: deliveryId, whatsapp_status: "failed", whatsapp_error: result.error }
  await updateDeliveryWorkflow(scope).run({ input: changes })
  return { whatsapp_status: changes.whatsapp_status, whatsapp_error: changes.whatsapp_error }
}
