import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { retryWhile } from "../lib/retry-while"

/**
 * Email de confirmation de commande au client (distinct du subscriber
 * order-placed.ts qui notifie le marchand via n8n).
 */
export default async function orderPlacedCustomerEmailHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const orderModuleService = container.resolve(Modules.ORDER)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)

  try {
    // "total" est un champ calculé dérivé de order_summary - sans la
    // relation "summary", Medusa le renvoie à 0 (confirmé : tous les emails
    // de confirmation affichaient 0 FCFA). Même avec la relation, il peut
    // rester à 0 juste après order.placed si order_summary n'est pas encore
    // matérialisé à cet instant précis (constaté en conditions réelles le
    // 2026-09-04, correct quelques secondes plus tard sans changement de
    // code) - on réessaie brièvement plutôt que d'envoyer un montant faux.
    const order = await retryWhile(
      () =>
        orderModuleService.retrieveOrder(event.data.id, {
          select: ["id", "display_id", "email", "currency_code", "total"],
          relations: ["summary"],
        }),
      (result) => !result.total
    )

    if (!order.email) {
      logger.info(
        `Commande ${order.id} placée — pas d'email client, confirmation ignorée`
      )
      return
    }

    await notificationModuleService.createNotifications({
      to: order.email,
      channel: "email",
      template: "order-placed",
      data: {
        display_id: order.display_id,
        total: order.total,
        currency_code: order.currency_code,
        orange_money_number: process.env.ORANGE_MONEY_NUMBER,
        orange_money_account_name: process.env.ORANGE_MONEY_NAME,
      },
    })
  } catch (error) {
    logger.error(
      `Commande ${event.data.id} placée — échec de l'envoi de l'email de confirmation`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
