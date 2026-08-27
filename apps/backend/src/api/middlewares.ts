import { defineMiddlewares } from "@medusajs/framework/http"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { checkRateLimit } from "./middlewares/rate-limiter"

const RESET_PASSWORD_MAX_REQUESTS = 5
const RESET_PASSWORD_WINDOW_SECONDS = 15 * 60

// Exporté séparément (plutôt que défini en ligne dans `defineMiddlewares`) pour pouvoir
// être testé directement avec un req/res/next factice, sans démarrer l'application Medusa.
export async function resetPasswordRateLimitMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    const cache = req.scope.resolve(Modules.CACHE)
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown"
    const rateLimitOptions = {
      maxRequests: RESET_PASSWORD_MAX_REQUESTS,
      windowSeconds: RESET_PASSWORD_WINDOW_SECONDS,
    }

    const ipResult = await checkRateLimit(cache, `rate-limit:auth-reset-password:${ip}`, rateLimitOptions)

    // Le validateur Zod du core Medusa (qui peuple `req.validatedBody`) s'exécute
    // après ce middleware pour cette route, donc `req.validatedBody` n'est pas encore
    // disponible ici. Le bodyParser JSON global, lui, s'exécute avant : `req.body` est
    // donc déjà accessible. Une requête malformée (pas encore validée, `identifier`
    // absent ou non-string) ne doit pas faire planter le middleware : on retombe alors
    // sur le seul bucket IP.
    const rawIdentifier = (req.body as Record<string, unknown> | undefined)?.identifier
    const identifierResult =
      typeof rawIdentifier === "string"
        ? await checkRateLimit(
            cache,
            `rate-limit:auth-reset-password:identifier:${rawIdentifier.toLowerCase().trim()}`,
            rateLimitOptions
          )
        : null

    const blockedResult = !ipResult.allowed ? ipResult : identifierResult && !identifierResult.allowed ? identifierResult : null

    if (blockedResult) {
      res.setHeader("Retry-After", String(blockedResult.retryAfterSeconds))
      res.status(429).json({
        type: "rate_limit_exceeded",
        message: "Trop de demandes de réinitialisation de mot de passe. Réessayez plus tard.",
      })
      return
    }
  } catch (error) {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Limiteur de débit indisponible pour la réinitialisation de mot de passe, requête laissée passer : ${errorMessage}`)
  }

  next()
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/auth/customer/emailpass/reset-password",
      methods: ["POST"],
      middlewares: [resetPasswordRateLimitMiddleware],
    },
  ],
})
