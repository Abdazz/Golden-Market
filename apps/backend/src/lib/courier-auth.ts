import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto"

// Authentification du livreur (spec 2026-10-15 espace-livreur) : PIN à 4 chiffres
// haché avec scrypt, jeton signé HMAC (id du livreur + expiration), sans session Medusa.

export const COURIER_TOKEN_TTL_SECONDS = 12 * 3600

export const isValidPin = (pin: unknown): pin is string => typeof pin === "string" && /^\d{4}$/.test(pin)

export const hashPin = (pin: string): string => {
  const salt = randomBytes(16)
  return `${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`
}

export const verifyPin = (pin: string, stored: string): boolean => {
  const [saltHex, hashHex] = stored.split(":")
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, "hex")
  const actual = scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length || 32)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url")

export const signCourierToken = (courierId: string, secret: string, now: number = Date.now()): string => {
  const payload = Buffer.from(JSON.stringify({ c: courierId, e: now + COURIER_TOKEN_TTL_SECONDS * 1000 })).toString("base64url")
  return `${payload}.${sign(payload, secret)}`
}

export const verifyCourierToken = (token: string, secret: string, now: number = Date.now()): string | null => {
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [payload, signature] = parts
  if (!payload || !signature) return null
  const expected = Buffer.from(sign(payload, secret))
  const actual = Buffer.from(signature)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  try {
    const { c, e } = JSON.parse(Buffer.from(payload, "base64url").toString())
    return typeof c === "string" && typeof e === "number" && e > now ? c : null
  } catch {
    return null
  }
}
