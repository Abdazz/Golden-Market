import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { formatAmount } from "../modules/resend/templates"
import { PHONE_ORDER_PAYMENT_METHODS, PhoneOrderPaymentMethod } from "../lib/phone-order"

type OrderConfirmationData = {
  id: string
  display_id: number
  currency_code: string
  total: number
  metadata?: Record<string, unknown> | null
  shipping_address?: { first_name?: string; phone?: string }
  items?: Array<{ product_title?: string }>
  payment_collections?: Array<{
    amount?: number
    payments?: Array<{ provider_id?: string; amount?: number }>
  }>
}

// Miroir des libellés FR de apps/storefront/src/lib/constants.tsx
// (paymentInfoMap) - dupliqué ici car ce fichier storefront est du JSX,
// inutilisable côté backend.
const PAYMENT_METHOD_LABELS: Array<[prefix: string, label: string]> = [
  ["pp_orange-money-manual", "Orange Money"],
  ["pp_moov-money-manual", "Moov Money"],
  ["pp_cash-on-delivery", "Paiement à la réception"],
]

function paymentMethodLabel(providerId: string | undefined) {
  const match = PAYMENT_METHOD_LABELS.find(([prefix]) =>
    providerId?.startsWith(prefix)
  )
  // Aucun paiement par carte n'est proposé (Orange Money, Moov Money, cash) :
  // sans moyen de paiement connu - commande créée depuis l'admin (Orders >
  // Drafts) pour un client qui a commandé par téléphone -, il a été convenu
  // de vive voix. L'ancien repli "Carte bancaire" était toujours faux.
  return match?.[1] ?? "À convenir avec notre équipe"
}

/**
 * Confirmation de commande au client par WhatsApp (distinct du subscriber
 * order-placed-customer-email.ts, envoyé en parallèle — voir HANDOFF.md
 * 2026-09-04). Le téléphone est obligatoire à la commande, contrairement à
 * l'email : ce canal est donc censé toujours fonctionner.
 */
export default async function orderPlacedCustomerWhatsappHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const webhookUrl = process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL
  const webhookSecret = process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_SECRET

  if (!webhookUrl) {
    logger.info(
      `Commande ${event.data.id} placée — N8N_ORDER_CONFIRMATION_WEBHOOK_URL non configuré, confirmation WhatsApp ignorée`
    )
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  try {
    // orderModuleService.retrieveOrder ne résout ni les champs calculés
    // (order.total, dérivé de order_summary) ni payment_collections (lien
    // inter-modules Order/Payment, pas une relation du module Order) :
    // query.graph est nécessaire pour les deux.
    //
    // order.total/summary.current_order_total peuvent rester à 0 juste
    // après order.placed, et pas seulement au tout premier essai (constaté
    // en conditions réelles le 2026-09-04 sur deux commandes distinctes,
    // y compris après plusieurs tentatives espacées de retryWhile - le
    // problème n'est donc pas une simple latence de matérialisation).
    // payment.amount (fixé explicitement à l'autorisation du paiement,
    // jamais recalculé) est une source fiable pour un montant total fiable
    // ici, car Golden Market n'a qu'un seul paiement par commande, sans
    // paiement partiel.
    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "currency_code",
        "total",
        "metadata",
        "shipping_address.first_name",
        "shipping_address.phone",
        "items.product_title",
        "payment_collections.amount",
        "payment_collections.payments.provider_id",
        "payment_collections.payments.amount",
      ],
      filters: { id: event.data.id },
    })

    const typedOrder = order as unknown as OrderConfirmationData
    const phone = typedOrder.shipping_address?.phone
    const firstName = typedOrder.shipping_address?.first_name

    if (!phone) {
      logger.info(
        `Commande ${typedOrder.id} placée — pas de téléphone sur l'adresse de livraison, confirmation WhatsApp ignorée`
      )
      return
    }

    const productSummary =
      typedOrder.items && typedOrder.items.length === 1
        ? typedOrder.items[0].product_title
        : `${typedOrder.items?.length ?? 0} articles`

    const collection = typedOrder.payment_collections?.[0]
    const payment = collection?.payments?.[0]
    const providerId = payment?.provider_id
    // Commande issue d'un brouillon : aucun paiement encore enregistré, mais la
    // collecte de paiement porte déjà le montant à encaisser (order.total peut
    // valoir 0 juste après order.placed, voir plus haut).
    const amount = payment?.amount ?? collection?.amount ?? typedOrder.total
    const total = formatAmount(amount, typedOrder.currency_code)
    const displayId = String(typedOrder.display_id)
    // Commande prise par téléphone (bouton "Nouvelle commande" de l'admin) :
    // aucun paiement enregistré, le moyen convenu est dans les métadonnées.
    const agreedMethod = typedOrder.metadata?.payment_method as PhoneOrderPaymentMethod | undefined
    const paymentMethod =
      !providerId && agreedMethod && PHONE_ORDER_PAYMENT_METHODS[agreedMethod]
        ? PHONE_ORDER_PAYMENT_METHODS[agreedMethod]
        : paymentMethodLabel(providerId)

    // Deux templates Meta approuvés : order_confirmation_from_website
    // (avec "Bonjour {prénom}") pour les commandes du site, et
    // order_confirmation_from_whatsapp (sans "Bonjour X", le client est déjà
    // en conversation) pour les commandes passées via le chatbot lui-même.
    const isWhatsappOrder = typedOrder.metadata?.source === "whatsapp"
    const templateName = isWhatsappOrder
      ? "order_confirmation_from_whatsapp"
      : "order_confirmation_from_website"
    const params = isWhatsappOrder
      ? [productSummary, total, displayId, paymentMethod]
      : [firstName || "", productSummary, total, displayId, paymentMethod]

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhookSecret ? { "x-webhook-secret": webhookSecret } : {}),
      },
      body: JSON.stringify({
        phone,
        template_name: templateName,
        params,
      }),
    })

    if (!response.ok) {
      throw new Error(`Webhook n8n a répondu ${response.status}`)
    }

    logger.info(
      `Commande ${typedOrder.id} placée — confirmation WhatsApp envoyée à n8n`
    )
  } catch (error) {
    logger.error(
      `Commande ${event.data.id} placée — échec de l'envoi de la confirmation WhatsApp`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
