import crypto from "node:crypto"
import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import type {
  IAuthVerificationProvider,
  RequestAuthVerificationDTO,
  RequestAuthVerificationResponse,
  ConfirmAuthVerificationDTO,
  ConfirmAuthVerificationResponse,
} from "@medusajs/framework/types"

// Code à 6 chiffres plus sensible au brute-force qu'un jeton opaque long :
// fenêtre d'expiration volontairement plus courte que le provider "token"
// natif de Medusa (15 min).
const CODE_TTL_MS = 10 * 60 * 1000

const generateCode = (): string => {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0")
}

const hashCode = (code: string): string => {
  return crypto.createHash("sha256").update(code).digest("hex")
}

/**
 * Provider de vérification Medusa (interface IAuthVerificationProvider,
 * @medusajs/types >= 2.16.0) qui génère un code à 6 chiffres au lieu du
 * jeton opaque du provider "token" natif. Miroir volontaire de
 * @medusajs/auth/dist/providers/verification/token.js (lu directement dans
 * node_modules pour confirmer le contrat exact : authVerificationService
 * injecté depuis le container du module Auth, mêmes méthodes
 * list/create/update) - sans importer quoi que ce soit du chemin interne
 * @medusajs/auth, qui n'est pas une API publique documentée.
 *
 * L'envoi effectif du code par WhatsApp n'a pas lieu ici : ce provider
 * retourne le code au workflow appelant, qui émet
 * AuthWorkflowEvents.VERIFICATION_REQUESTED - voir le subscriber
 * auth-verification-requested-whatsapp.ts pour la livraison.
 */
export class WhatsappOtpVerificationProvider implements IAuthVerificationProvider {
  static identifier = "whatsapp-otp"
  readonly identifier = WhatsappOtpVerificationProvider.identifier

  private authVerificationService_: any

  constructor({ authVerificationService }: { authVerificationService: any }, _options: Record<string, never>) {
    this.authVerificationService_ = authVerificationService
  }

  async request(data: RequestAuthVerificationDTO): Promise<RequestAuthVerificationResponse> {
    const existing = await this.authVerificationService_.list(
      {
        auth_identity_id: data.auth_identity_id,
        entity_id: data.entity_id,
        entity_type: data.entity_type,
      },
      { take: 1, skip: 0 }
    )

    if (existing.length && existing[0].verified_at) {
      return existing[0]
    }

    const code = generateCode()
    const codeHash = hashCode(code)
    const requestedAt = new Date(Date.now())
    const expiresAt = new Date(requestedAt.getTime() + CODE_TTL_MS)

    let verification
    if (existing.length) {
      verification = await this.authVerificationService_.update({
        id: existing[0].id,
        code_provider: data.code_provider,
        provider_metadata: { code_hash: codeHash },
        requested_at: requestedAt,
        verified_at: null,
      })
    } else {
      verification = await this.authVerificationService_.create({
        auth_identity_id: data.auth_identity_id,
        entity_id: data.entity_id,
        entity_type: data.entity_type,
        code_provider: data.code_provider,
        provider_metadata: { code_hash: codeHash },
        requested_at: requestedAt,
        metadata: data.metadata ?? null,
      })
    }

    return { ...verification, code, expires_at: expiresAt }
  }

  async confirm(data: ConfirmAuthVerificationDTO): Promise<ConfirmAuthVerificationResponse> {
    if (!data.code) {
      throw new Error("Verification code is required")
    }

    const [verification] = await this.authVerificationService_.list({
      provider_metadata: { code_hash: hashCode(data.code) },
    })

    if (!verification || verification.verified_at) {
      throw new Error("Verification code is invalid or already used")
    }

    if (data.code_provider && data.code_provider !== verification.code_provider) {
      throw new Error(`Verification code does not belong to provider "${data.code_provider}"`)
    }

    const expiresAt = new Date(verification.requested_at).getTime() + CODE_TTL_MS
    if (expiresAt <= Date.now()) {
      throw new Error("Verification code has expired")
    }

    return await this.authVerificationService_.update({
      id: verification.id,
      verified_at: new Date(Date.now()),
    })
  }
}

export default ModuleProvider(Modules.AUTH, {
  services: [WhatsappOtpVerificationProvider],
})
