import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../../modules/delivery"
import type DeliveryModuleService from "../../../modules/delivery/service"
import { hashPin, isValidPin, signCourierToken, verifyPin } from "../../../lib/courier-auth"
import { normalizePhone } from "../../../lib/normalize-phone"
import { checkRateLimit } from "../../middlewares/rate-limiter"

const DENIED = { message: "Téléphone ou code incorrect." }
const WINDOW_SECONDS = 15 * 60
const tooMany = (retryAfterSeconds: number) => ({
  message: `Trop d'essais. Réessayez dans ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
})

// Hachage factice : un téléphone inconnu ou un livreur sans PIN coûte le même
// temps qu'un mauvais PIN (pas de différence mesurable côté client). Calculé
// une seule fois, au premier besoin.
let dummyHash: Promise<string> | undefined
const dummy = () => (dummyHash ??= hashPin("0000"))

// Adresse du client : relayée par le storefront (x-forwarded-for, première valeur).
const clientIp = (req: MedusaRequest) =>
  String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.ip || "unknown"

// Connexion du livreur : téléphone + PIN, même réponse que le numéro existe ou
// non. Deux limites sur 15 minutes : 20 essais par adresse IP (tous comptés),
// 5 échecs par téléphone. Les essais d'un même téléphone passent un par un
// (verrou) : la lecture et l'écriture du compteur ne peuvent pas être doublées
// par des essais simultanés.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as { phone?: unknown; pin?: unknown }
  const cache = req.scope.resolve(Modules.CACHE)
  const ipLimit = await checkRateLimit(cache, `rate-limit:courier-login:ip:${clientIp(req)}`, {
    maxRequests: 20,
    windowSeconds: WINDOW_SECONDS,
  })
  if (!ipLimit.allowed) {
    res.status(429).json(tooMany(ipLimit.retryAfterSeconds))
    return
  }
  let phone: string
  try {
    phone = normalizePhone(String(body.phone ?? ""))
  } catch {
    res.status(401).json(DENIED)
    return
  }
  try {
    const { status, json } = await req.scope
      .resolve(Modules.LOCKING)
      .execute(`courier-login:${phone}`, () => attempt(req, phone, body.pin), { timeout: 10 })
    res.status(status).json(json)
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(`Connexion livreur : ${(error as Error).message}`)
    res.status(500).json({ message: "Une erreur est survenue, réessayez." })
  }
}

async function attempt(req: MedusaRequest, phone: string, pin: unknown): Promise<{ status: number; json: unknown }> {
  const cache = req.scope.resolve(Modules.CACHE)
  const rateKey = `rate-limit:courier-login:${phone}`
  const limit = await checkRateLimit(cache, rateKey, { maxRequests: 5, windowSeconds: WINDOW_SECONDS })
  if (!limit.allowed) return { status: 429, json: tooMany(limit.retryAfterSeconds) }
  const secret = process.env.COOKIE_SECRET
  if (!secret || !isValidPin(pin)) return { status: 401, json: DENIED }
  const svc = req.scope.resolve(DELIVERY_MODULE) as DeliveryModuleService
  const couriers = await svc.listCouriers({ active: true })
  const courier = couriers.find((c) => {
    try {
      return normalizePhone(c.phone) === phone
    } catch {
      return false
    }
  })
  const ok = await verifyPin(pin, courier?.pin_hash ?? (await dummy()))
  if (!courier?.pin_hash || !ok) return { status: 401, json: DENIED }
  // Seuls les échecs comptent dans la limite par téléphone (5 essais ratés / 15 min).
  await cache.invalidate(rateKey)
  return { status: 200, json: { token: signCourierToken(courier.id, secret), courier: { id: courier.id, name: courier.name } } }
}
