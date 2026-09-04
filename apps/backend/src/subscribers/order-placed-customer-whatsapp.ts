import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { formatAmount } from "../modules/resend/templates"

type OrderConfirmationData = {
  id: string
  display_id: number
  currency_code: string
  total: number
  shipping_address?: { first_name?: string; phone?: string }
  items?: Array<{ product_title?: string }>
  payment_collections?: Array<{
    payments?: Array<{ provider_id?: string }>
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
  return match?.[1] ?? "Carte bancaire"
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
    // (total, dérivé de order_summary — reste à 0 sans la relation summary)
    // ni payment_collections (lien inter-modules Order/Payment, pas une
    // relation du module Order) : query.graph est nécessaire pour les deux.
    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "currency_code",
        "total",
        "summary.current_order_total",
        "shipping_address.first_name",
        "shipping_address.phone",
        "items.product_title",
        "payment_collections.payments.provider_id",
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

    const providerId =
      typedOrder.payment_collections?.[0]?.payments?.[0]?.provider_id

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhookSecret ? { "x-webhook-secret": webhookSecret } : {}),
      },
      body: JSON.stringify({
        phone,
        first_name: firstName || "",
        product_summary: productSummary,
        total: formatAmount(typedOrder.total, typedOrder.currency_code),
        display_id: String(typedOrder.display_id),
        payment_method: paymentMethodLabel(providerId),
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
