import { ChangeActionType, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  beginOrderEditOrderWorkflow,
  cancelBeginOrderEditWorkflow,
  confirmOrderEditRequestWorkflow,
  createOrderChangeActionsWorkflow,
  createOrderEditShippingMethodWorkflow,
  orderEditAddNewItemWorkflow,
  orderEditUpdateItemQuantityWorkflow,
  requestOrderEditRequestWorkflow,
  updateOrderWorkflow,
} from "@medusajs/medusa/core-flows"
import { computeAmountToCollect, defaultTypeForCity } from "./delivery-rules"
import { isPaid, isShippedOrDelivered, outstandingOf } from "./delivery-service-helpers"
import { orderNumberOf } from "./order-number"
import type { PhoneOrderInput } from "./phone-order"
import { shippingFeeForVariants } from "./shipping-fee-query"
import { updateDeliveryWorkflow } from "../workflows/update-delivery"

// "Modifier la commande" (2026-10-12, demandé par le propriétaire) : mêmes
// champs que "Nouvelle commande" (téléphone, nom, ville, adresse, moyen de
// paiement, articles), tant que la commande n'est ni payée, ni livrée /
// expédiée, ni annulée. Le type de livraison suit la ville (Ouaga = livraison
// Ouaga sans frais, autre ville = expédition avec ses frais, recalculés comme
// à la création). Articles et frais passent par une modification de commande
// Medusa (historique, total et collecte de paiement recalculés) ; une
// livraison en cours est mise à jour (type, adresse, montant à encaisser).

const ORDER_EDIT_FIELDS = [
  "id",
  "display_id",
  "custom_display_id",
  "status",
  "total",
  "metadata",
  "summary.*",
  "items.*",
  "items.variant.id",
  "items.variant.title",
  "items.variant.product.title",
  "items.variant.product.thumbnail",
  "shipping_methods.*",
  "shipping_address.*",
  "fulfillments.id",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
]

export const loadOrder = async (scope: any, orderId: string) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [order],
  } = await query.graph({ entity: "order", fields: ORDER_EDIT_FIELDS, filters: { id: orderId } })
  return order
}

export const loadDeliveries = async (scope: any, orderId: string) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "delivery",
    fields: ["id", "type", "status", "transport_company"],
    filters: { order_id: orderId },
  })
  return data as { id: string; type: string; status: string; transport_company: string | null }[]
}

// Raison pour laquelle la commande ne peut plus être modifiée, ou null.
export const notEditableReason = (order: any, deliveries: { status: string }[]): string | null => {
  if (order.status === "canceled") return "Commande annulée."
  if (isPaid(order)) return "Commande déjà payée."
  if (isShippedOrDelivered(order) || deliveries.some((d) => d.status === "delivered" || d.status === "shipped")) {
    return "Commande déjà livrée ou expédiée."
  }
  return null
}

// Suppression (2026-10-15) : commande saisie à la main (source "telephone"),
// sous les mêmes conditions que la modification. "Supprimer" = annuler et masquer.
export const notDeletableReason = (order: any, deliveries: { status: string }[]): string | null => {
  if (order.metadata?.source !== "telephone") return "Seule une commande saisie à la main peut être supprimée."
  return notEditableReason(order, deliveries)
}

export async function orderEditDefaults(scope: any, orderId: string) {
  const order = await loadOrder(scope, orderId)
  if (!order) return null
  const deliveries = await loadDeliveries(scope, orderId)
  const address = order.shipping_address ?? {}
  return {
    order_id: order.id,
    order_number: orderNumberOf(order),
    not_editable_reason: notEditableReason(order, deliveries),
    not_deletable_reason: notDeletableReason(order, deliveries),
    phone: address.phone ?? "",
    first_name: address.first_name ?? "",
    last_name: address.last_name ?? "",
    city: address.city ?? "",
    address: address.address_1 ?? "",
    payment_method: (order.metadata?.payment_method as string | undefined) ?? "",
    lines: (order.items ?? []).map((item: any) => ({
      variant_id: item.variant_id ?? item.variant?.id,
      product_title: item.product_title ?? item.variant?.product?.title ?? item.title,
      variant_title: item.variant_title ?? item.variant?.title ?? null,
      thumbnail: item.thumbnail ?? item.variant?.product?.thumbnail ?? null,
      price: Number(item.unit_price ?? 0),
      original_price: null,
      in_stock: true,
      quantity: Number(item.quantity ?? 0),
    })),
  }
}

// Différences d'articles : quantités des articles existants (0 = retiré) et
// nouveaux articles, par variante.
export const itemChanges = (
  existing: { id: string; variant_id: string | null; quantity: number }[],
  wanted: { variant_id: string; quantity: number }[]
) => {
  const wantedByVariant = new Map(wanted.map((w) => [w.variant_id, w.quantity]))
  const seen = new Set<string>()
  const updates: { id: string; quantity: number }[] = []
  for (const item of existing) {
    const variant = item.variant_id ?? ""
    const quantity = !seen.has(variant) ? wantedByVariant.get(variant) ?? 0 : 0
    seen.add(variant)
    if (quantity !== Number(item.quantity)) updates.push({ id: item.id, quantity })
  }
  const additions = wanted.filter((w) => !seen.has(w.variant_id) && w.quantity > 0)
  return { updates, additions }
}

export async function submitOrderEdit(scope: any, orderId: string, input: PhoneOrderInput, userId: string) {
  const order = await loadOrder(scope, orderId)
  if (!order) throw new Error("Commande introuvable.")
  const deliveries = await loadDeliveries(scope, orderId)
  const reason = notEditableReason(order, deliveries)
  if (reason) throw new Error(`${reason} Elle ne peut plus être modifiée.`)

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const fee = await shippingFeeForVariants(
    query,
    input.city,
    input.items.map((item) => item.variant_id)
  )
  const { updates, additions } = itemChanges(
    (order.items ?? []).map((i: any) => ({ id: i.id, variant_id: i.variant_id, quantity: Number(i.quantity) })),
    input.items
  )
  const shippingMethods = (order.shipping_methods ?? []) as { id: string; amount: number; shipping_option_id: string }[]
  const currentFee = shippingMethods.reduce((sum, m) => sum + Number(m.amount ?? 0), 0)
  const feeChanged = Math.round(currentFee) !== fee
  const shippingOptionId = shippingMethods[0]?.shipping_option_id

  // Articles et frais : une seule modification de commande Medusa, annulée
  // si une étape échoue (la commande reste telle qu'elle était).
  if (updates.length || additions.length || feeChanged) {
    await beginOrderEditOrderWorkflow(scope).run({
      input: { order_id: orderId, created_by: userId, description: "Modifier la commande (admin Golden Market)" },
    })
    try {
      if (updates.length) {
        await orderEditUpdateItemQuantityWorkflow(scope).run({ input: { order_id: orderId, items: updates } })
      }
      if (additions.length) {
        await orderEditAddNewItemWorkflow(scope).run({ input: { order_id: orderId, items: additions } })
      }
      if (feeChanged) {
        if (!shippingOptionId) throw new Error("Mode de livraison introuvable sur la commande.")
        // Modification en cours (créée ci-dessus) : l'action de retrait doit lui être rattachée.
        const {
          data: [change],
        } = await query.graph({
          entity: "order_change",
          fields: ["id", "version"],
          filters: { order_id: orderId, status: ["pending"] },
        })
        if (!change) throw new Error("Modification de commande introuvable.")
        // Ancienne livraison retirée, nouvelle au montant recalculé.
        await createOrderChangeActionsWorkflow(scope).run({
          input: shippingMethods.map((m) => ({
            action: ChangeActionType.SHIPPING_REMOVE,
            reference: "order_shipping_method",
            reference_id: m.id,
            order_change_id: change.id,
            version: change.version,
            order_id: orderId,
          })),
        })
        await createOrderEditShippingMethodWorkflow(scope).run({
          input: { order_id: orderId, shipping_option_id: shippingOptionId, custom_amount: fee },
        })
      }
      await requestOrderEditRequestWorkflow(scope).run({ input: { order_id: orderId, requested_by: userId } })
      await confirmOrderEditRequestWorkflow(scope).run({ input: { order_id: orderId, confirmed_by: userId } })
    } catch (error) {
      await cancelBeginOrderEditWorkflow(scope)
        .run({ input: { order_id: orderId } })
        .catch(() => undefined)
      throw error
    }
  }

  // Coordonnées et moyen de paiement.
  const address = {
    first_name: input.first_name,
    last_name: input.last_name ?? "",
    address_1: input.address,
    city: input.city,
    country_code: "bf",
    phone: input.phone,
  }
  await updateOrderWorkflow(scope).run({
    input: {
      id: orderId,
      user_id: userId,
      shipping_address: address,
      billing_address: address,
      metadata: { ...(order.metadata ?? {}), payment_method: input.payment_method },
    },
  })

  // Livraison en cours : même livreur, type / adresse / montant à encaisser à jour.
  const active = deliveries.find((d) => d.status === "assigned")
  if (active) {
    const updated = await loadOrder(scope, orderId)
    const type = defaultTypeForCity(input.city)
    await updateDeliveryWorkflow(scope).run({
      input: {
        id: active.id,
        type,
        address: type === "express" ? input.address : null,
        destination_city: type === "expedition" ? input.city : null,
        transport_company: type === "expedition" ? active.transport_company : null,
        amount_to_collect: computeAmountToCollect({ type, paymentStatus: "not_paid", outstanding: outstandingOf(updated) }),
      },
    })
  }
}
