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

/**
 * Provider de paiement à la réception (Golden Market).
 *
 * Aucun transfert à effectuer avant la livraison : le client paie en
 * espèces directement au livreur. Réservé, côté storefront, aux commandes
 * livrées à Ouagadougou (voir le filtre sur shipping_address.city dans
 * checkout/components/payment) - le marchand livre lui-même à domicile
 * dans cette ville, contrairement aux autres villes expédiées via un
 * transporteur tiers qui ne peut pas encaisser pour son compte.
 *
 * Flux : session créée → autorisée lors du passage de commande (commande
 * « en attente ») → capture manuelle dans l'admin une fois le livreur payé
 * → commande payée. Même mécanique que les providers Mobile Money manuels
 * (orange-money-manual.ts, moov-money-manual.ts), sans numéro à afficher.
 */
export class CashOnDeliveryService extends AbstractPaymentProvider<Record<string, never>> {
  static identifier = "cash-on-delivery"

  constructor(container: any, options: Record<string, never>) {
    super(container, options)
  }

  private getInstructions() {
    return {
      provider: "cash-on-delivery",
      note: "Vous payez en espèces directement à la réception de votre colis.",
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
  services: [CashOnDeliveryService],
})
