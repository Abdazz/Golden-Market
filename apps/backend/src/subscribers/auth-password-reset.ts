import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

type PasswordResetEventData = {
  entity_id: string
  token: string
  actor_type: string
}

/**
 * N'envoie l'email que pour les clients (actor_type "customer") : la
 * réinitialisation du mot de passe admin reste hors périmètre.
 */
export default async function passwordResetHandler({
  event,
  container,
}: SubscriberArgs<PasswordResetEventData>) {
  if (event.data.actor_type !== "customer") {
    return
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const storefrontUrl = process.env.STOREFRONT_URL ?? "http://localhost:8001"
  const email = event.data.entity_id

  try {
    await notificationModuleService.createNotifications({
      to: email,
      channel: "email",
      template: "password-reset",
      data: {
        reset_url: `${storefrontUrl}/reset-password?token=${event.data.token}&email=${encodeURIComponent(email)}`,
      },
    })
  } catch (error) {
    logger.error(
      `Échec de l'envoi de l'email de réinitialisation à ${email}`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
