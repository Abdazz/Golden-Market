import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import type {
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { Resend } from "resend"
import { emailTemplates, type EmailTemplate } from "./templates"

type ResendOptions = {
  api_key: string
  from: string
}

type InjectedDependencies = {
  logger: Logger
}

class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "resend"

  static validateOptions(options: Record<any, any>) {
    if (!options.api_key) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "L'option api_key est requise pour le provider de notification resend"
      )
    }

    if (!options.from) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "L'option from est requise pour le provider de notification resend"
      )
    }
  }

  private resendClient: Resend
  private options: ResendOptions
  private logger: Logger
  private templates: Record<string, EmailTemplate>

  constructor({ logger }: InjectedDependencies, options: ResendOptions) {
    super()
    this.resendClient = new Resend(options.api_key)
    this.options = options
    this.logger = logger
    this.templates = emailTemplates
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const template = this.templates[notification.template]

    if (!template) {
      this.logger.error(
        `Aucun template email pour "${notification.template}". Templates disponibles : ${Object.keys(this.templates).join(", ")}`
      )
      return {}
    }

    const { subject, html } = template(notification.data ?? {})

    const { data, error } = await this.resendClient.emails.send({
      from: this.options.from,
      to: [notification.to],
      subject,
      html,
    })

    if (error || !data) {
      this.logger.error(
        `Échec de l'envoi de l'email "${notification.template}" à ${notification.to}`,
        error ?? undefined
      )
      return {}
    }

    return { id: data.id }
  }
}

export default ResendNotificationProviderService
