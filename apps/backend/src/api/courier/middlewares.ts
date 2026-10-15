import type { MedusaNextFunction, MedusaRequest, MedusaResponse, MiddlewareRoute } from "@medusajs/framework/http"
import { verifyCourierToken } from "../../lib/courier-auth"

// Routes /courier/* (spec 2026-10-15 espace-livreur) : jeton livreur en
// `Authorization: Bearer`, appelées par le storefront uniquement. Un jeton
// livreur ne donne accès à rien d'autre (les routes /admin exigent leur
// propre session).
export type CourierRequest = MedusaRequest & { courier_id: string }

export function authenticateCourier(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const header = req.headers.authorization ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  const secret = process.env.COOKIE_SECRET
  const courierId = token && secret ? verifyCourierToken(token, secret) : null
  if (!courierId) {
    res.status(401).json({ message: "Session expirée : reconnectez-vous." })
    return
  }
  ;(req as CourierRequest).courier_id = courierId
  next()
}

export const courierMiddlewares: MiddlewareRoute[] = [
  { matcher: "/courier/deliveries*", middlewares: [authenticateCourier] },
]
