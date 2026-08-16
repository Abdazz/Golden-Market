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
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: event.data.id,
        provider: "orange-money-manual",
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
