import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

/**
 * Email de confirmation de commande au client (distinct du subscriber
 * order-placed.ts qui notifie le marchand via n8n).
 */
export default async function orderPlacedCustomerEmailHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  const orderModuleService = container.resolve(Modules.ORDER)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)

  const order = await orderModuleService.retrieveOrder(event.data.id, {
    select: ["id", "display_id", "email", "currency_code", "total"],
  })

  if (!order.email) {
    logger.info(
      `Commande ${order.id} placée — pas d'email client, confirmation ignorée`
    )
    return
  }

  try {
    await notificationModuleService.createNotifications({
      to: order.email,
      channel: "email",
      template: "order-placed",
      data: {
        display_id: order.display_id,
        total: order.total,
        currency_code: order.currency_code,
      },
    })
  } catch (error) {
    logger.error(
      `Commande ${order.id} placée — échec de l'envoi de l'email de confirmation`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
