import {
  buildOrderRegistrationTokenMetadata,
  generateOrderRegistrationToken,
  hashOrderRegistrationToken,
  verifyOrderRegistrationToken,
} from "../order-registration-token"

describe("order-registration-token", () => {
  it("génère un jeton de haute entropie et son hash de façon déterministe", () => {
    const token = generateOrderRegistrationToken()
    expect(token).toHaveLength(64)
    expect(hashOrderRegistrationToken(token)).toBe(hashOrderRegistrationToken(token))
    expect(hashOrderRegistrationToken(token)).not.toBe(token)
  })

  it("valide un jeton correct et non expiré", () => {
    const token = generateOrderRegistrationToken()
    const metadata = buildOrderRegistrationTokenMetadata(token)
    expect(verifyOrderRegistrationToken(metadata, token)).toEqual({ valid: true })
  })

  it("rejette un jeton incorrect", () => {
    const token = generateOrderRegistrationToken()
    const metadata = buildOrderRegistrationTokenMetadata(token)
    const result = verifyOrderRegistrationToken(metadata, "wrong-token")
    expect(result.valid).toBe(false)
  })

  it("rejette un jeton expiré", () => {
    const token = generateOrderRegistrationToken()
    const metadata = buildOrderRegistrationTokenMetadata(token)
    metadata.registration_token_expires_at = new Date(Date.now() - 1000).toISOString()
    const result = verifyOrderRegistrationToken(metadata, token)
    expect(result.valid).toBe(false)
  })

  it("rejette un jeton déjà utilisé", () => {
    const token = generateOrderRegistrationToken()
    const metadata = buildOrderRegistrationTokenMetadata(token)
    metadata.registration_token_used_at = new Date().toISOString()
    const result = verifyOrderRegistrationToken(metadata, token)
    expect(result.valid).toBe(false)
  })

  it("rejette l'absence de métadonnées (commande jamais préparée pour la création de compte)", () => {
    const result = verifyOrderRegistrationToken(undefined, "anything")
    expect(result.valid).toBe(false)
  })
})
