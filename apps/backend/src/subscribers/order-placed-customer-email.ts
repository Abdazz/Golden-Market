import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

type OrderEmailData = {
  id: string
  display_id: number
  email?: string | null
  currency_code: string
  total: number
  payment_collections?: Array<{
    payments?: Array<{ amount?: number }>
  }>
}

/**
 * Email de confirmation de commande au client (distinct du subscriber
 * order-placed.ts qui notifie le marchand via n8n).
 */
export default async function orderPlacedCustomerEmailHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  try {
    // order.total (champ calculé dérivé d'order_summary) peut rester à 0
    // juste après order.placed - constaté en conditions réelles le
    // 2026-09-04 sur plusieurs commandes, y compris avec une relation
    // "summary" explicite et des tentatives espacées. payment.amount est
    // fixé explicitement à l'autorisation du paiement (jamais recalculé) :
    // source fiable ici, Golden Market n'ayant qu'un seul paiement par
    // commande, sans paiement partiel.
    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "currency_code",
        "total",
        "payment_collections.payments.amount",
      ],
      filters: { id: event.data.id },
    })

    const typedOrder = order as unknown as OrderEmailData

    if (!typedOrder.email) {
      logger.info(
        `Commande ${typedOrder.id} placée — pas d'email client, confirmation ignorée`
      )
      return
    }

    const amount =
      typedOrder.payment_collections?.[0]?.payments?.[0]?.amount ??
      typedOrder.total

    await notificationModuleService.createNotifications({
      to: typedOrder.email,
      channel: "email",
      template: "order-placed",
      data: {
        display_id: typedOrder.display_id,
        total: amount,
        currency_code: typedOrder.currency_code,
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
