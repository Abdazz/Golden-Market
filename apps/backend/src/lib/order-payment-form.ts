import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { capturePaymentWorkflow, markPaymentCollectionAsPaid } from "@medusajs/medusa/core-flows"
import { CASHBOOK_MODULE } from "../modules/cashbook"
import { expectedFees, finalPaymentEntries, finalReferences, type PaymentFormValues } from "./cashbook-rules"
import { defaultTypeForCity, type DeliveryType } from "./delivery-rules"
import { ORDER_FIELDS, outstandingOf } from "./delivery-service-helpers"
import { orderNumberOf } from "./order-number"
import { productShippingFee as feeOfProduct } from "./shipping-fee-rules"
import { replaceOrderEntriesWorkflow } from "../workflows/cash-entries"
import { completeDeliveryWorkflow } from "../workflows/complete-delivery"
import { updateDeliveryWorkflow } from "../workflows/update-delivery"
import { finishDelivery } from "./delivery-completion"
import { syncOrderAfterDelivery } from "./delivery-order-sync"
import { mayEditPayment, paymentEditStatus } from "./payment-edit-rules"

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
      "metadata",
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
    fields: ["id", "type", "status", "assigned_at", "courier_fee", "transport_fee", "amount_to_collect"],
    filters: { order_id: orderId },
  })
  return (data as any[])
    .filter((d) => d.status !== "canceled")
    .sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())[0]
}

// Paiement réellement saisi dans le formulaire, relu dans les écritures finales
// de la caisse (la date de la vente = dernière action). Null : jamais enregistré.
export async function recordedPayment(scope: any, orderId: string) {
  const refs = finalReferences(orderId)
  const entries: any[] = await scope.resolve(CASHBOOK_MODULE).listCashEntries({ reference: [refs.sale, refs.courierFee, refs.transportFee] })
  const sale = entries.find((e) => e.reference === refs.sale)
  if (!sale) return null
  const amountOf = (reference: string) => Number(entries.find((e) => e.reference === reference)?.amount ?? 0)
  return {
    amount: Number(sale.amount),
    courier_fee: amountOf(refs.courierFee),
    transport_fee: amountOf(refs.transportFee),
    recorded_at: new Date(sale.date).toISOString(),
  }
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
  const recorded = await recordedPayment(scope, orderId)
  const outstanding = outstandingOf(order) || Number(recorded?.amount ?? 0) || Number(order.total ?? collection?.amount ?? 0)
  // Déjà enregistré : les valeurs réelles, pas des valeurs proposées.
  const fees = recorded
    ? { courier_fee: recorded.courier_fee, transport_fee: recorded.transport_fee }
    : expectedFees({
        type,
        courierFee: delivery?.courier_fee ?? null,
        transportFee: delivery?.transport_fee ?? null,
        productShippingFee,
      })
  const delivered =
    delivery?.status === "delivered" ||
    delivery?.status === "shipped" ||
    (order.fulfillments ?? []).some((f: any) => f.delivered_at && !f.canceled_at)
  return {
    order_number: orderNumberOf(order),
    type,
    amount: recorded ? recorded.amount : Math.round(outstanding),
    ...fees,
    recorded: recorded ? { ...paymentEditStatus(recorded.recorded_at), ...recorded } : null,
    payment_method: (order.metadata?.payment_method as string | undefined) ?? null,
    delivered,
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
  // skipEditWindow : validation d'un rapport du livreur par l'admin, non soumise
  // à la limite de 24 h après la dernière action.
  options: { delivered?: boolean; skipEditWindow?: boolean } = {}
): Promise<{ warning: string | null }> {
  const order = await loadOrder(scope, orderId)
  if (!order) throw new Error("Commande introuvable.")
  // Déjà enregistré : modifiable seulement 24 h après la dernière action.
  const recorded = await recordedPayment(scope, orderId)
  if (recorded && !mayEditPayment({ recordedAt: recorded.recorded_at, skipWindow: options.skipEditWindow })) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Délai de 24 h dépassé : le paiement ne peut plus être modifié.")
  }
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

  // Déjà marquée "Livrée" seule (tournée du jour ou fiche commande) : le livreur
  // devait encaisser -> montant encaissé et course repris sur la livraison, pour
  // le versement du soir (argent à récupérer chez le livreur).
  if (delivery?.status === "delivered" && Number(delivery.amount_to_collect ?? 0) > 0) {
    await updateDeliveryWorkflow(scope).run({
      input: { id: delivery.id, amount_collected: values.amount, courier_fee: values.courier_fee },
    })
  }

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

// Bouton "Marquer livrée" de la fiche commande (2026-10-12) : livraison seule,
// sans paiement ni écriture de caisse (ceux-ci passent par "Marquer payée").
// La livraison en cours est terminée (rien d'encaissé par le livreur,
// déstockage du livreur, "Fulfillment" livré) ; sans livraison en cours, seule
// la commande Medusa passe en livrée.
export async function markOrderDelivered(scope: any, orderId: string): Promise<{ warning: string | null }> {
  const delivery = await latestDelivery(scope, orderId)
  if (delivery?.status === "assigned") {
    // Déjà marquée payée (formulaire) alors que le livreur devait encaisser :
    // il a encaissé ce montant (versement du soir). Sinon rien pour l'instant,
    // repris quand on marquera la commande payée.
    const previousSale =
      Number(delivery.amount_to_collect ?? 0) > 0
        ? (await scope.resolve(CASHBOOK_MODULE).listCashEntries({ reference: [finalReferences(orderId).sale] }))[0]
        : undefined
    const { result: completed } = await completeDeliveryWorkflow(scope).run({
      input: { id: delivery.id, status: "delivered", amount_collected: Number(previousSale?.amount ?? 0) },
    })
    const { warning } = await finishDelivery(scope, completed)
    return { warning }
  }
  const warning = await syncOrderAfterDelivery(scope, { orderId, status: "delivered", collected: 0 })
  return { warning }
}
