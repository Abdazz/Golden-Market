import { defineMiddlewares } from "@medusajs/framework/http"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { checkRateLimit } from "./middlewares/rate-limiter"

const RESET_PASSWORD_MAX_REQUESTS = 5
const RESET_PASSWORD_WINDOW_SECONDS = 15 * 60

export default defineMiddlewares({
  routes: [
    {
      matcher: "/auth/customer/emailpass/reset-password",
      methods: ["POST"],
      middlewares: [
        async (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
          try {
            const cache = req.scope.resolve(Modules.CACHE)
            const ip = req.ip ?? req.socket.remoteAddress ?? "unknown"

            const result = await checkRateLimit(cache, `rate-limit:auth-reset-password:${ip}`, {
              maxRequests: RESET_PASSWORD_MAX_REQUESTS,
              windowSeconds: RESET_PASSWORD_WINDOW_SECONDS,
            })

            if (!result.allowed) {
              res.setHeader("Retry-After", String(result.retryAfterSeconds))
              res.status(429).json({
                message: "Trop de demandes de réinitialisation de mot de passe. Réessayez plus tard.",
              })
              return
            }
          } catch (error) {
            const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
            logger.warn(`Limiteur de débit indisponible pour la réinitialisation de mot de passe, requête laissée passer : ${error}`)
          }

          next()
        },
      ],
    },
  ],
})
