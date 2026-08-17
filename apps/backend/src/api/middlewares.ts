import { defineMiddlewares } from "@medusajs/framework/http"
import rateLimit from "express-rate-limit"

// L'endpoint de réinitialisation de mot de passe est public et non authentifié :
// il répond toujours 201 (comportement Medusa voulu, pour ne pas révéler l'existence
// d'un compte) et déclenche un email sortant à chaque appel une fois RESEND_API_KEY
// configurée. Sans limite de débit, c'est un vecteur d'amplification/abus (spam email
// vers n'importe quelle adresse, appels répétés coûteux côté provider email).
export const resetPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
})

export default defineMiddlewares({
  routes: [
    {
      matcher: "/auth/customer/emailpass/reset-password",
      methods: ["POST"],
      middlewares: [resetPasswordRateLimiter],
    },
  ],
})
