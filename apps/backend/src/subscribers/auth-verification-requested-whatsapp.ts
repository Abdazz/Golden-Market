import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Forme réelle de l'événement émise par
// @medusajs/core-flows/dist/auth/workflows/request-verification.js (lu
// directement dans node_modules - le commentaire JSDoc public de
// AuthWorkflowEvents.VERIFICATION_REQUESTED décrit une forme différente et
// plus ancienne, non fiable ici).
type VerificationRequestedData = {
  entity_id: string
  entity_type?: string
  code_provider: string
  auth_identity_id?: string
  code: string
  expires_at?: string
}

/**
 * Livre le code de vérification whatsapp-otp (voir
 * modules/whatsapp-otp-verification.ts) par WhatsApp, via le même webhook
 * n8n générique déjà utilisé pour les confirmations de commande (accepte
 * {phone, template_name, params} sans être spécifique aux commandes malgré
 * son nom de variable d'environnement - voir
 * order-placed-customer-whatsapp.ts). Ignore tout autre code_provider :
 * le chemin "token" (email) natif de Medusa n'est délibérément pas touché
 * par cette itération (voir spec, section Non-objectifs).
 */
export default async function authVerificationRequestedWhatsappHandler({
  event,
  container,
}: SubscriberArgs<VerificationRequestedData>) {
  if (event.data.code_provider !== "whatsapp-otp") {
    return
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const webhookUrl = process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_URL
  const webhookSecret = process.env.N8N_ORDER_CONFIRMATION_WEBHOOK_SECRET

  if (!webhookUrl) {
    logger.info(
      `Code de vérification WhatsApp demandé pour ${event.data.entity_id} — N8N_ORDER_CONFIRMATION_WEBHOOK_URL non configuré, envoi ignoré`
    )
    return
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhookSecret ? { "x-webhook-secret": webhookSecret } : {}),
      },
      body: JSON.stringify({
        phone: event.data.entity_id,
        template_name: "account_verification_code",
        params: [event.data.code],
      }),
    })

    if (!response.ok) {
      throw new Error(`Webhook n8n a répondu ${response.status}`)
    }

    logger.info(`Code de vérification WhatsApp envoyé à n8n pour ${event.data.entity_id}`)
  } catch (error) {
    logger.error(
      `Échec de l'envoi du code de vérification WhatsApp pour ${event.data.entity_id}`,
      error as Error
    )
  }
}

export const config: SubscriberConfig = {
  event: "auth.verification_requested",
}
