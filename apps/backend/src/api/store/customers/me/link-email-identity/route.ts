import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { linkEmailIdentity } from "../../../../../lib/link-email-identity"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { email, password } = (req.body as Record<string, unknown>) ?? {}

  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ message: "Email invalide." })
    return
  }

  if (typeof password !== "string" || !password) {
    res.status(400).json({ message: "Mot de passe requis." })
    return
  }

  const customerId = req.auth_context?.actor_id

  if (!customerId) {
    res.status(401).json({ message: "Non authentifié." })
    return
  }

  const authModuleService = req.scope.resolve(Modules.AUTH)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    const result = await linkEmailIdentity(authModuleService, req.scope, {
      email,
      password,
      customerId,
    })

    if (!result.success) {
      res.status(400).json({ message: result.error })
      return
    }

    res.status(200).json({ success: true })
  } catch (error) {
    logger.error("Échec de la liaison d'une identité email secondaire", error as Error)
    res.status(500).json({ message: "Une erreur est survenue." })
  }
}
