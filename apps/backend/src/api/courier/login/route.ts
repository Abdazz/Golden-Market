import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../../modules/delivery"
import type DeliveryModuleService from "../../../modules/delivery/service"
import { isValidPin, signCourierToken, verifyPin } from "../../../lib/courier-auth"
import { normalizePhone } from "../../../lib/normalize-phone"
import { checkRateLimit } from "../../middlewares/rate-limiter"

const DENIED = { message: "Téléphone ou code incorrect." }

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
  const limit = await checkRateLimit(cache, `rate-limit:courier-login:${phone}`, { maxRequests: 5, windowSeconds: 15 * 60 })
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
  if (!courier?.pin_hash || !verifyPin(body.pin, courier.pin_hash)) {
    res.status(401).json(DENIED)
    return
  }
  res.json({ token: signCourierToken(courier.id, secret), courier: { id: courier.id, name: courier.name } })
}
