import crypto from "node:crypto"

// Doit rester cohérent avec le cookie côté storefront
// (apps/storefront/src/lib/data/cookies.ts, setOrderRegistrationProof) qui
// utilise la même durée de vie.
export const ORDER_REGISTRATION_TOKEN_TTL_MS = 30 * 60 * 1000

export type OrderRegistrationTokenMetadata = {
  registration_token_hash?: string
  registration_token_expires_at?: string
  registration_token_used_at?: string | null
}

export function generateOrderRegistrationToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

export function hashOrderRegistrationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export function buildOrderRegistrationTokenMetadata(
  token: string
): OrderRegistrationTokenMetadata {
  return {
    registration_token_hash: hashOrderRegistrationToken(token),
    registration_token_expires_at: new Date(
      Date.now() + ORDER_REGISTRATION_TOKEN_TTL_MS
    ).toISOString(),
    registration_token_used_at: null,
  }
}

export function verifyOrderRegistrationToken(
  metadata: OrderRegistrationTokenMetadata | null | undefined,
  token: string
): { valid: true } | { valid: false; reason: string } {
  if (!metadata?.registration_token_hash) {
    return {
      valid: false,
      reason: "Aucun jeton de création de compte pour cette commande.",
    }
  }

  if (metadata.registration_token_used_at) {
    return { valid: false, reason: "Ce jeton a déjà été utilisé." }
  }

  if (
    !metadata.registration_token_expires_at ||
    new Date(metadata.registration_token_expires_at).getTime() <= Date.now()
  ) {
    return {
      valid: false,
      reason: "Le jeton de création de compte a expiré.",
    }
  }

  if (hashOrderRegistrationToken(token) !== metadata.registration_token_hash) {
    return { valid: false, reason: "Jeton de création de compte invalide." }
  }

  return { valid: true }
}
