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
 * (action_source "phone_call") et WhatsApp ("business_messaging" ou "chat")
 * sont envoyées sans pixel côté client. Une commande WhatsApp issue d'une pub
 * est d'abord envoyée en business_messaging avec le jeton WhatsApp ; si Meta la
 * refuse, elle est renvoyée en chat avec le jeton CAPI habituel.
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
        "shipping_address.country_code",
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

    const wabaId = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID
    const waToken = process.env.META_WHATSAPP_EVENTS_ACCESS_TOKEN
    const typedOrder = order as unknown as OrderForMetaConversion
    const eventTime = Math.floor(Date.now() / 1000)
    const purchaseEvent = buildPurchaseEvent(typedOrder, eventTime, {
      storefrontUrl: process.env.STOREFRONT_URL,
      whatsappBusinessAccountId: wabaId,
      whatsappEventsConfigured: !!(wabaId && waToken),
    })

    let sentSource = purchaseEvent.action_source
    if (purchaseEvent.action_source === "business_messaging") {
      try {
        // Jeu de données dédié aux événements WhatsApp s'il est configuré,
        // sinon le pixel du site ; le renvoi en chat reste sur META_PIXEL_ID.
        const whatsappDatasetId = process.env.META_WHATSAPP_DATASET_ID || pixelId
        await sendConversionEvent(purchaseEvent, {
          pixelId: whatsappDatasetId,
          accessToken: waToken as string,
        })
      } catch (error) {
        logger.error(
          `Commande ${event.data.id} placée — refus business_messaging, renvoi en chat`,
          error as Error
        )
        const chatEvent = buildPurchaseEvent(typedOrder, eventTime, { forceActionSource: "chat" })
        await sendConversionEvent(chatEvent, { pixelId, accessToken })
        sentSource = chatEvent.action_source
      }
    } else {
      await sendConversionEvent(purchaseEvent, { pixelId, accessToken })
    }
    logger.info(
      `Commande ${event.data.id} placée — événement Purchase (${sentSource}) envoyé à Meta`
    )
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
