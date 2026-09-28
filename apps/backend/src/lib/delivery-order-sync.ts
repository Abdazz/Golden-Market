import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  capturePaymentWorkflow,
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
  markPaymentCollectionAsPaid,
} from "@medusajs/medusa/core-flows"

// Répercute une livraison terminée sur la commande Medusa : paiement marqué
// payé (livraison express encaissée) et colonne native "Fulfillment" (livrée
// / expédiée). Tolérant : un échec ne bloque jamais la livraison, il renvoie
// un avertissement affiché dans l'admin (le statut de livraison fait foi).
// Idempotent : relit l'état de la commande avant chaque action. Sans
// notification Medusa (no_notification) : le client est suivi par WhatsApp.
const firstLine = (e: unknown) => String((e as Error)?.message ?? e).split("\n")[0].slice(0, 300)

export async function syncOrderAfterDelivery(
  container: any,
  input: { orderId: string; status: "delivered" | "shipped"; collected: number }
): Promise<string | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const warnings: string[] = []
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.payments.id",
      "payment_collections.payments.captured_at",
      // Articles chargés en entier : avec items.quantity seul, la quantité
      // revient vide et la création du fulfillment échoue.
      "items.*",
      "fulfillments.id",
      "fulfillments.shipped_at",
      "fulfillments.delivered_at",
    ],
    filters: { id: input.orderId },
  })
  if (!order) return "Commande introuvable pour la synchronisation."

  if (input.status === "delivered" && input.collected > 0) {
    for (const collection of order.payment_collections ?? []) {
      try {
        if (collection.status === "not_paid") {
          // Commande prise par téléphone : aucun paiement encore enregistré.
          await markPaymentCollectionAsPaid(container).run({ input: { order_id: order.id, payment_collection_id: collection.id } })
        } else if (collection.status === "authorized" || collection.status === "partially_authorized") {
          // Commande du site en paiement à la livraison : paiement autorisé
          // à la commande, capturé ici quand le livreur a encaissé (constaté
          // le 2026-09-28 : sans cela la commande restait non encaissée).
          for (const payment of collection.payments ?? []) {
            if (!payment.captured_at) await capturePaymentWorkflow(container).run({ input: { payment_id: payment.id } })
          }
        }
      } catch (e) {
        warnings.push(`Paiement non marqué payé : ${firstLine(e)}`)
      }
    }
  }

  try {
    let fulfillment = (order.fulfillments ?? [])[0]
    if (!fulfillment) {
      const { result } = await createOrderFulfillmentWorkflow(container).run({
        input: {
          order_id: order.id,
          items: (order.items ?? []).map((i: any) => ({ id: i.id, quantity: i.quantity })),
          no_notification: true,
        },
      })
      fulfillment = result
    }
    if (!fulfillment.shipped_at) {
      await createOrderShipmentWorkflow(container).run({
        input: {
          order_id: order.id,
          fulfillment_id: fulfillment.id,
          items: (order.items ?? []).map((i: any) => ({ id: i.id, quantity: i.quantity })),
          no_notification: true,
        },
      })
    }
    if (input.status === "delivered" && !fulfillment.delivered_at) {
      await markOrderFulfillmentAsDeliveredWorkflow(container).run({ input: { orderId: order.id, fulfillmentId: fulfillment.id } })
    }
  } catch (e) {
    warnings.push(`Statut « Fulfillment » non mis à jour : ${firstLine(e)}`)
  }

  return warnings.length ? warnings.join(" ") : null
}
