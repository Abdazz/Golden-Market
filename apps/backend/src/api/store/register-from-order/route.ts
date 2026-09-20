import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { normalizePhone } from "../../../lib/normalize-phone"
import { registerCustomerFromOrder } from "../../../lib/register-customer-from-order"
import {
  verifyOrderRegistrationToken,
  type OrderRegistrationTokenMetadata,
} from "../../../lib/order-registration-token"

type OrderForRegistration = {
  id: string
  customer_id: string | null
  email: string | null
  metadata?: OrderRegistrationTokenMetadata | null
  shipping_address?: { first_name?: string; last_name?: string; phone?: string }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { order_id, password, registration_token } = (req.body as Record<string, unknown>) ?? {}

  if (typeof order_id !== "string" || !order_id) {
    res.status(400).json({ message: "order_id requis." })
    return
  }

  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ message: "Mot de passe invalide (8 caractères minimum)." })
    return
  }

  if (typeof registration_token !== "string" || !registration_token) {
    res.status(400).json({ message: "registration_token requis." })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "customer_id",
      "email",
      "metadata",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.phone",
    ],
    filters: { id: order_id },
  })

  const typedOrder = order as unknown as OrderForRegistration | undefined

  if (!typedOrder) {
    res.status(404).json({ message: "Commande introuvable." })
    return
  }

  if (typedOrder.customer_id) {
    res.status(400).json({ message: "Cette commande est déjà associée à un compte." })
    return
  }

  const tokenCheck = verifyOrderRegistrationToken(typedOrder.metadata, registration_token)

  if (!tokenCheck.valid) {
    res.status(403).json({ message: tokenCheck.reason })
    return
  }

  const rawPhone = typedOrder.shipping_address?.phone

  if (!rawPhone) {
    res.status(400).json({ message: "Aucun numéro de téléphone sur cette commande." })
    return
  }

  const phone = normalizePhone(rawPhone)
  const authModuleService = req.scope.resolve(Modules.AUTH)
  const orderModuleService = req.scope.resolve(Modules.ORDER)

  try {
    const result = await registerCustomerFromOrder(authModuleService, { phone, password })

    if (!result.success) {
      res.status(400).json({ message: result.error })
      return
    }

    // Jeton à usage unique : marqué consommé seulement après la création
    // réussie du compte, pour permettre un nouvel essai si l'étape
    // précédente échoue pour une raison récupérable (ex: identité déjà
    // existante avec un mot de passe différent).
    await orderModuleService.updateOrders(order_id, {
      metadata: {
        ...typedOrder.metadata,
        registration_token_used_at: new Date().toISOString(),
      },
    })

    res.status(200).json({
      phone,
      email: typedOrder.email,
      first_name: typedOrder.shipping_address?.first_name,
      last_name: typedOrder.shipping_address?.last_name,
    })
  } catch (error) {
    logger.error("Échec de la création de compte depuis une commande", error as Error)
    res.status(500).json({ message: "Une erreur est survenue." })
  }
}
