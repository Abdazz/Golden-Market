import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { capturePaymentWorkflow, markPaymentCollectionAsPaid } from "@medusajs/medusa/core-flows"
import { CASHBOOK_MODULE } from "../modules/cashbook"
import { expectedFees, finalPaymentEntries, finalReferences, type PaymentFormValues } from "./cashbook-rules"
import { defaultTypeForCity, type DeliveryType } from "./delivery-rules"
import { ORDER_FIELDS, outstandingOf } from "./delivery-service-helpers"
import { orderNumberOf } from "./order-number"
import { productShippingFee as feeOfProduct } from "./shipping-fee-rules"
import { replaceOrderEntriesWorkflow } from "../workflows/cash-entries"
import { completeDeliveryWorkflow } from "../workflows/complete-delivery"
import { finishDelivery } from "./delivery-completion"
import { syncOrderAfterDelivery } from "./delivery-order-sync"

// Formulaire "Marquer comme payée" de la fiche commande (2026-10-11, demandé
// par le propriétaire) : montant encaissé et frais engagés par le livreur
// (course + compagnie de transport), pré-remplis puis modifiables. La
// commande Medusa est marquée payée comme avec le bouton natif ; la caisse ne
// retient que les montants du formulaire pour la commande.

const loadOrder = async (scope: any, orderId: string) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      ...ORDER_FIELDS,
      "items.variant.product.metadata",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.amount",
      "payment_collections.payments.id",
      "payment_collections.payments.captured_at",
    ],
    filters: { id: orderId },
  })
  return order
}

const latestDelivery = async (scope: any, orderId: string) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "delivery",
    fields: ["id", "type", "status", "assigned_at", "courier_fee", "transport_fee"],
    filters: { order_id: orderId },
  })
  return (data as any[])
    .filter((d) => d.status !== "canceled")
    .sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())[0]
}

export async function paymentFormDefaults(scope: any, orderId: string) {
  const order = await loadOrder(scope, orderId)
  if (!order) return null
  const delivery = await latestDelivery(scope, orderId)
  const type: DeliveryType = delivery?.type ?? defaultTypeForCity(order.shipping_address?.city)
  // Frais de la compagnie = frais d'expédition payés par le client sur la
  // commande (livraison de la commande, calculée par produit au panier). Si la
  // commande n'en porte pas (adresse à Ouaga mais colis finalement expédié) :
  // même règle qu'au panier, les frais les plus élevés des produits
  // (lib/shipping-fee-rules.ts).
  const items = order.items ?? []
  const shippingPaid = (order.shipping_methods ?? []).reduce((sum: number, m: any) => sum + Number(m.amount ?? 0), 0)
  const productShippingFee =
    type !== "expedition"
      ? 0
      : shippingPaid > 0
      ? Math.round(shippingPaid)
      : items.length
      ? Math.max(...items.map((i: any) => feeOfProduct(i.variant?.product?.metadata ?? null)))
      : 0
  const collection = (order.payment_collections ?? [])[0]
  // Commande déjà payée (formulaire rouvert pour la marquer livrée) : montant
  // déjà retenu par la caisse, sinon le total de la commande.
  const previousSale = (await scope.resolve(CASHBOOK_MODULE).listCashEntries({ reference: [finalReferences(orderId).sale] }))[0]
  const outstanding = outstandingOf(order) || Number(previousSale?.amount ?? 0) || Number(order.total ?? collection?.amount ?? 0)
  return {
    order_number: orderNumberOf(order),
    type,
    amount: Math.round(outstanding),
    ...expectedFees({
      type,
      courierFee: delivery?.courier_fee ?? null,
      transportFee: delivery?.transport_fee ?? null,
      productShippingFee,
    }),
    // Origine des frais pré-remplis : saisis sur la livraison ou valeur par défaut.
    courier_fee_saved: delivery?.courier_fee !== null && delivery?.courier_fee !== undefined,
    // Case "Livrée ?" : cochée par défaut pour une livraison Ouaga.
    delivered_default: type === "express",
    delivery_status: delivery?.status ?? null,
    transport_fee_saved: delivery?.transport_fee !== null && delivery?.transport_fee !== undefined,
  }
}

// Paiement Medusa : collecte sans paiement -> marquée payée (comme le bouton
// natif) ; paiement autorisé non capturé (paiement à la livraison) -> capturé.
const markOrderPaid = async (scope: any, order: any) => {
  for (const collection of order.payment_collections ?? []) {
    if (collection.status === "not_paid") {
      await markPaymentCollectionAsPaid(scope).run({ input: { order_id: order.id, payment_collection_id: collection.id } })
    } else if (collection.status === "authorized" || collection.status === "partially_authorized") {
      for (const payment of collection.payments ?? []) {
        if (!payment.captured_at) await capturePaymentWorkflow(scope).run({ input: { payment_id: payment.id } })
      }
    }
  }
}

// Case "Livrée ?" (2026-10-12) : remplace le formulaire "Livrée" de la tournée
// du jour. Cochée, la livraison en cours est terminée (montant encaissé et
// course du livreur repris du formulaire, déstockage du livreur, "Fulfillment"
// livré) ; sans livraison en cours, seule la commande Medusa passe en livrée.
export async function submitPaymentForm(
  scope: any,
  orderId: string,
  values: PaymentFormValues,
  options: { delivered?: boolean } = {}
): Promise<{ warning: string | null }> {
  const order = await loadOrder(scope, orderId)
  if (!order) throw new Error("Commande introuvable.")
  // Livraison Ouaga : pas de compagnie de transport (champ masqué dans le formulaire).
  const delivery = await latestDelivery(scope, orderId)
  const type: DeliveryType = delivery?.type ?? defaultTypeForCity(order.shipping_address?.city)
  if (type !== "expedition") values = { ...values, transport_fee: 0 }
  // La caisse d'abord : une capture inscrite par l'abonné payment.captured
  // juste après est ignorée (écritures du formulaire déjà présentes).
  await replaceOrderEntriesWorkflow(scope).run({
    input: {
      order_id: orderId,
      entries: finalPaymentEntries({ ...values, orderId, orderNumber: orderNumberOf(order), date: new Date() }),
    },
  })
  await markOrderPaid(scope, order)

  if (!options.delivered) return { warning: null }
  if (delivery?.status === "assigned") {
    const { result: completed } = await completeDeliveryWorkflow(scope).run({
      input: {
        id: delivery.id,
        status: "delivered",
        amount_collected: values.amount,
        courier_fee: values.courier_fee,
        transport_fee: type === "expedition" ? values.transport_fee : null,
      },
    })
    const { warning } = await finishDelivery(scope, completed)
    return { warning }
  }
  const warning = await syncOrderAfterDelivery(scope, { orderId, status: "delivered", collected: 0 })
  return { warning }
}

// Commande dont la caisse vient du formulaire : les écritures automatiques
// (vente capturée, frais d'une livraison terminée plus tard) sont ignorées.
export async function hasFinalPaymentEntries(scope: any, orderId: string | null): Promise<boolean> {
  if (!orderId) return false
  // Lecture impossible : l'écriture automatique est inscrite, comme avant le formulaire.
  try {
    const entries = await scope.resolve(CASHBOOK_MODULE).listCashEntries({ reference: [finalReferences(orderId).sale] })
    return entries.length > 0
  } catch {
    return false
  }
}
