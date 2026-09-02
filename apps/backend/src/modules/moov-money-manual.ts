import {
  AbstractPaymentProvider,
  ModuleProvider,
  Modules,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"

type MoovMoneyManualOptions = {
  phone_number?: string
  account_name?: string
}

/**
 * Provider de paiement manuel Moov Money (Golden Market).
 *
 * Identique au provider Orange Money manuel (voir orange-money-manual.ts) :
 * pas d'intégration API Mobile Money, le client transfère le montant sur le
 * numéro affiché, puis le marchand confirme le paiement dans l'admin
 * (capture) quand le client signale le transfert.
 *
 * Flux : session créée (affichage des instructions) → autorisée lors du
 * passage de commande (commande « en attente ») → capture manuelle dans
 * l'admin → commande payée.
 */
export class MoovMoneyManualService extends AbstractPaymentProvider<MoovMoneyManualOptions> {
  static identifier = "moov-money-manual"

  private readonly phoneNumber: string
  private readonly accountName: string

  constructor(container: any, options: MoovMoneyManualOptions) {
    super(container, options)
    this.phoneNumber = options.phone_number ?? ""
    this.accountName = options.account_name ?? ""
  }

  /** Instructions affichées au client pendant le checkout. */
  private getInstructions() {
    return {
      provider: "moov-money-manual",
      phone_number: this.phoneNumber,
      account_name: this.accountName,
      note: "Envoyez le montant exact en FCFA par Moov Money, puis confirmez votre commande. Le marchand la validera dès réception du paiement.",
    }
  }

  async getPaymentData() {
    return this.getInstructions()
  }

  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    return {
      id: crypto.randomUUID(),
      data: this.getInstructions(),
    }
  }

  async authorizePayment(_input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return {
      data: this.getInstructions(),
      status: PaymentSessionStatus.AUTHORIZED,
    }
  }

  async getPaymentStatus(_input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    return {
      data: this.getInstructions(),
      status: PaymentSessionStatus.AUTHORIZED,
    }
  }

  async updatePayment(_input: UpdatePaymentInput) {
    return { data: this.getInstructions() }
  }

  async deletePayment(_input: DeletePaymentInput) {
    return { data: {} }
  }

  async capturePayment(_input: CapturePaymentInput) {
    return { data: {} }
  }

  async refundPayment(_input: RefundPaymentInput) {
    return { data: {} }
  }

  async retrievePayment(_input: RetrievePaymentInput) {
    return { data: this.getInstructions() }
  }

  async cancelPayment(_input: CancelPaymentInput) {
    return { data: {} }
  }

  async getWebhookActionAndData(): Promise<WebhookActionResult> {
    return { action: "not_supported" }
  }
}

export default ModuleProvider(Modules.PAYMENT, {
  services: [MoovMoneyManualService],
})
