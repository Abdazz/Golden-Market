import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  buildPurchaseEvent,
  type OrderForMetaConversion,
} from "../lib/meta-conversions-mapping"
import { sendConversionEvent } from "../lib/meta-conversions-client"

/**
 * Envoie l'événement Purchase à la Meta Conversions API - complète (jamais
 * ne remplace) le pixel côté client (order-tracker), qui pousse le même
 * event_id (order.id) pour permettre à Meta de dédupliquer les deux plutôt
 * que de compter la vente en double. Le pixel ne déduplique que les
 * commandes du site (action_source "website") ; les commandes par téléphone
 * (action_source "phone_call") sont envoyées sans pixel côté client.
 * Voir meta-catalog-sync pour l'intégration Meta soeur (synchro catalogue) -
 * même pattern try/catch, jamais de throw, qu'order-placed-customer-whatsapp.ts.
 */
export default async function orderPlacedMetaConversionsApiHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const pixelId = process.env.META_PIXEL_ID
  const accessToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN

  if (!pixelId || !accessToken) {
    logger.info(
      `Commande ${event.data.id} placée — META_PIXEL_ID/META_CONVERSIONS_API_ACCESS_TOKEN non configurés, Conversions API ignorée`
    )
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  try {
    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "currency_code",
        "total",
        "metadata",
        "shipping_address.phone",
        // Articles et livraison chargés en entier : avec items.quantity demandé
        // seul, query.graph ne renvoie pas la quantité (constaté le 2026-09-27).
        "items.*",
        "shipping_methods.*",
      ],
      filters: { id: event.data.id },
    })

    if (!order) {
      return
    }

    const purchaseEvent = buildPurchaseEvent(
      order as unknown as OrderForMetaConversion,
      Math.floor(Date.now() / 1000)
    )

    await sendConversionEvent(purchaseEvent, { pixelId, accessToken })
    logger.info(`Commande ${event.data.id} placée — événement Purchase envoyé à Meta`)
  } catch (error) {
    logger.error(
      `Commande ${event.data.id} placée — échec de l'envoi de l'événement Purchase à Meta`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
