import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../../modules/delivery"
import type DeliveryModuleService from "../../../modules/delivery/service"
import { hashPin, isValidPin, signCourierToken, verifyPin } from "../../../lib/courier-auth"
import { normalizePhone } from "../../../lib/normalize-phone"
import { checkRateLimit } from "../../middlewares/rate-limiter"

const DENIED = { message: "Téléphone ou code incorrect." }

// Hachage factice : un téléphone inconnu ou un livreur sans PIN coûte le même
// temps qu'un mauvais PIN (pas de différence mesurable côté client).
const DUMMY_HASH = hashPin("0000")

// Connexion du livreur : téléphone + PIN. 5 essais par téléphone et par
// 15 minutes ; même réponse que le numéro existe ou non.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as { phone?: unknown; pin?: unknown }
  let phone: string
  try {
    phone = normalizePhone(String(body.phone ?? ""))
  } catch {
    res.status(401).json(DENIED)
    return
  }
  const cache = req.scope.resolve(Modules.CACHE)
  const rateKey = `rate-limit:courier-login:${phone}`
  const limit = await checkRateLimit(cache, rateKey, { maxRequests: 5, windowSeconds: 15 * 60 })
  if (!limit.allowed) {
    res.status(429).json({ message: `Trop d'essais. Réessayez dans ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.` })
    return
  }
  const secret = process.env.COOKIE_SECRET
  if (!secret || !isValidPin(body.pin)) {
    res.status(401).json(DENIED)
    return
  }
  const svc = req.scope.resolve(DELIVERY_MODULE) as DeliveryModuleService
  const couriers = await svc.listCouriers({ active: true })
  const courier = couriers.find((c) => {
    try {
      return normalizePhone(c.phone) === phone
    } catch {
      return false
    }
  })
  const ok = verifyPin(body.pin, courier?.pin_hash ?? DUMMY_HASH)
  if (!courier?.pin_hash || !ok) {
    res.status(401).json(DENIED)
    return
  }
  // Seuls les échecs comptent dans la limite (5 essais ratés / 15 min).
  await cache.invalidate(rateKey)
  res.json({ token: signCourierToken(courier.id, secret), courier: { id: courier.id, name: courier.name } })
}
