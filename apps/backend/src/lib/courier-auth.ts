import { createHmac, randomBytes, scrypt, timingSafeEqual } from "crypto"
import { promisify } from "util"

// Authentification du livreur (spec 2026-10-15 espace-livreur) : PIN à 4 chiffres
// haché avec scrypt, jeton signé HMAC (id du livreur + expiration), sans session Medusa.

export const COURIER_TOKEN_TTL_SECONDS = 12 * 3600

export const isValidPin = (pin: unknown): pin is string => typeof pin === "string" && /^\d{4}$/.test(pin)

// Asynchrone (pool de threads) : un calcul scrypt ne bloque pas le serveur.
// Format inchangé « sel:hash » en hexadécimal, paramètres scrypt par défaut.
const scryptAsync = promisify(scrypt) as (pin: string, salt: Buffer, keylen: number) => Promise<Buffer>

export const hashPin = async (pin: string): Promise<string> => {
  const salt = randomBytes(16)
  return `${salt.toString("hex")}:${(await scryptAsync(pin, salt, 32)).toString("hex")}`
}

export const verifyPin = async (pin: string, stored: string): Promise<boolean> => {
  const [saltHex, hashHex] = stored.split(":")
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, "hex")
  const actual = await scryptAsync(pin, Buffer.from(saltHex, "hex"), expected.length || 32)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// Adresse du client pour la limite d'essais par IP de la connexion. Secret de
// relais défini (production) : seule une requête du relais du storefront
// (en-tête x-courier-relay-secret identique) est acceptée, et l'adresse vient
// de x-courier-client-ip posé par ce relais. Sans secret (dev local) : adresse
// de connexion (socket). Jamais x-forwarded-for, déclaratif côté client.
export const resolveClientIp = (
  headers: Record<string, string | string[] | undefined>,
  reqIp: string | undefined,
  secret: string | undefined
): { ok: true; ip: string } | { ok: false } => {
  if (!secret) return { ok: true, ip: reqIp || "unknown" }
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""
  const given = Buffer.from(one(headers["x-courier-relay-secret"]))
  const expected = Buffer.from(secret)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false }
  return { ok: true, ip: one(headers["x-courier-client-ip"]).trim() || reqIp || "unknown" }
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
