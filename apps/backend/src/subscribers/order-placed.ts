import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Notification marchand (webhook n8n -> WhatsApp) à chaque commande placée.
 */
export default async function orderPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const webhookUrl = process.env.N8N_ORDER_WEBHOOK_URL

  if (!webhookUrl) {
    logger.info(
      `Commande ${event.data.id} placée — N8N_ORDER_WEBHOOK_URL non configuré, notification marchand ignorée`
    )
    return
  }

  try {
    // Le dépôt n8n_automation (agent WhatsApp) n'a, à ce jour, aucun workflow qui reçoit
    // ce webhook (vérifié en lisant son code : seul un webhook /webhook/whatsapp existe,
    // propre à la conversation WhatsApp entrante — rien côté commandes Medusa). Pas de
    // contrat existant à respecter, donc un payload minimal ({order_id, provider}) n'a
    // pas de valeur pour un futur workflow n8n qui devrait notifier le marchand par
    // WhatsApp : un humain ne peut rien faire d'un simple ID. On envoie donc ici tout ce
    // qu'un message WhatsApp lisible nécessiterait, à charge pour le futur workflow n8n
    // de choisir ce qu'il utilise.
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "currency_code",
        "total",
        "items.title",
        "items.detail.quantity",
      ],
      filters: { id: event.data.id },
    })
    const order = orders[0]

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: order.id,
        display_id: order.display_id,
        provider: "orange-money-manual",
        email: order.email,
        currency_code: order.currency_code,
        total: order.total,
        items: order.items?.map((item) => ({
          title: item.title,
          quantity: item.detail?.quantity,
        })),
      }),
    })

    if (!response.ok) {
      throw new Error(`Webhook n8n a répondu ${response.status}`)
    }

    logger.info(`Commande ${event.data.id} placée — notification marchand envoyée à n8n`)
  } catch (error) {
    logger.error(
      `Commande ${event.data.id} placée — échec de la notification marchand via n8n`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
