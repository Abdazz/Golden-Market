import { authenticate, defineMiddlewares, errorHandler } from "@medusajs/framework/http"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import * as Sentry from "@sentry/node"
import { checkRateLimit } from "./middlewares/rate-limiter"

// Observabilité backend (GlitchTip self-hosted) : capture chaque erreur avant de
// déléguer au comportement par défaut de Medusa - ne remplace rien de l'existant,
// ajoute uniquement l'envoi à Sentry/GlitchTip. Sentry.captureException est un
// no-op silencieux tant que SENTRY_DSN est absent (voir instrumentation.ts).
const originalErrorHandler = errorHandler()

const RESET_PASSWORD_MAX_REQUESTS = 5
const RESET_PASSWORD_WINDOW_SECONDS = 15 * 60

const SEMANTIC_SEARCH_MAX_REQUESTS = 30
const SEMANTIC_SEARCH_WINDOW_SECONDS = 60

const WHATSAPP_OTP_MAX_REQUESTS = 5
const WHATSAPP_OTP_WINDOW_SECONDS = 15 * 60

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

// Exporté séparément (même raison que resetPasswordRateLimitMiddleware) : route publique
// (clé publiable uniquement) qui déclenche un appel OpenAI facturé à chaque requête, donc
// accessible par n'importe qui, pas seulement le backend de l'agent WhatsApp de confiance.
export async function semanticSearchRateLimitMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    const cache = req.scope.resolve(Modules.CACHE)
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown"
    const rateLimitOptions = {
      maxRequests: SEMANTIC_SEARCH_MAX_REQUESTS,
      windowSeconds: SEMANTIC_SEARCH_WINDOW_SECONDS,
    }

    const ipResult = await checkRateLimit(cache, `rate-limit:semantic-search:${ip}`, rateLimitOptions)

    if (!ipResult.allowed) {
      res.setHeader("Retry-After", String(ipResult.retryAfterSeconds))
      res.status(429).json({
        type: "rate_limit_exceeded",
        message: "Trop de requêtes de recherche sémantique. Réessayez plus tard.",
      })
      return
    }
  } catch (error) {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Limiteur de débit indisponible pour la recherche sémantique, requête laissée passer : ${errorMessage}`)
  }

  next()
}

// Limite uniquement les demandes de vérification whatsapp-otp (nouveau
// provider, code livré par un vrai message WhatsApp facturé) - ne touche
// jamais au comportement du provider "token" par défaut, non concerné par
// cette itération. La route /auth/verification/request est générique à
// tous les code_provider, donc le filtre se fait ici sur le corps de la
// requête plutôt que sur l'URL.
// Limitation : applique un bucket indépendant par entity_id (numéro de
// téléphone), pas une limite globale par IP.
export async function whatsappOtpVerificationRateLimitMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const codeProvider = (req.body as Record<string, unknown> | undefined)?.code_provider

  if (codeProvider !== "whatsapp-otp") {
    return next()
  }

  try {
    const cache = req.scope.resolve(Modules.CACHE)
    const rateLimitOptions = {
      maxRequests: WHATSAPP_OTP_MAX_REQUESTS,
      windowSeconds: WHATSAPP_OTP_WINDOW_SECONDS,
    }

    const rawEntityId = (req.body as Record<string, unknown> | undefined)?.entity_id

    if (typeof rawEntityId === "string") {
      // Limite par entity_id (numéro de téléphone)
      const entityResult = await checkRateLimit(cache, `rate-limit:auth-whatsapp-otp:entity:${rawEntityId}`, rateLimitOptions)

      if (!entityResult.allowed) {
        res.setHeader("Retry-After", String(entityResult.retryAfterSeconds))
        res.status(429).json({
          type: "rate_limit_exceeded",
          message: "Trop de demandes de code de vérification. Réessayez plus tard.",
        })
        return
      }
    } else {
      // Fallback sur IP si entity_id absent
      const ip = req.ip ?? req.socket.remoteAddress ?? "unknown"
      const ipResult = await checkRateLimit(cache, `rate-limit:auth-whatsapp-otp:${ip}`, rateLimitOptions)

      if (!ipResult.allowed) {
        res.setHeader("Retry-After", String(ipResult.retryAfterSeconds))
        res.status(429).json({
          type: "rate_limit_exceeded",
          message: "Trop de demandes de code de vérification. Réessayez plus tard.",
        })
        return
      }
    }
  } catch (error) {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Limiteur de débit indisponible pour la vérification whatsapp-otp, requête laissée passer : ${errorMessage}`)
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
    {
      matcher: "/store/products-semantic-search",
      methods: ["GET"],
      middlewares: [semanticSearchRateLimitMiddleware],
    },
    {
      matcher: "/auth/verification/request",
      methods: ["POST"],
      middlewares: [whatsappOtpVerificationRateLimitMiddleware],
    },
    {
      matcher: "/store/customers/me/link-email-identity",
      methods: ["POST"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
  ],
  errorHandler: (error: any, req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
    Sentry.captureException(error)
    return originalErrorHandler(error, req, res, next)
  },
})
