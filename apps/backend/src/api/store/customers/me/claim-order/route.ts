import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { normalizePhone } from "../../../../../lib/normalize-phone"

type OrderForClaim = {
  id: string
  customer_id: string | null
  shipping_address?: { phone?: string }
}

type ProviderIdentityForClaim = {
  provider: string
  entity_id: string
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { order_id } = (req.body as Record<string, unknown>) ?? {}

  if (typeof order_id !== "string" || !order_id) {
    res.status(400).json({ message: "order_id requis." })
    return
  }

  const customerId = req.auth_context?.actor_id
  const authIdentityId = req.auth_context?.auth_identity_id

  if (!customerId || !authIdentityId) {
    res.status(401).json({ message: "Non authentifié." })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const authModuleService = req.scope.resolve(Modules.AUTH)

  const [
    {
      data: [order],
    },
    authIdentity,
  ] = await Promise.all([
    query.graph({
      entity: "order",
      fields: ["id", "customer_id", "shipping_address.phone"],
      filters: { id: order_id },
    }),
    authModuleService.retrieveAuthIdentity(authIdentityId, {
      relations: ["provider_identities"],
    }),
  ])

  const typedOrder = order as unknown as OrderForClaim | undefined

  if (!typedOrder) {
    res.status(404).json({ message: "Commande introuvable." })
    return
  }

  if (typedOrder.customer_id) {
    res.status(400).json({ message: "Cette commande est déjà associée à un compte." })
    return
  }

  const orderPhone = typedOrder.shipping_address?.phone

  // Contrôle de propriété : comparé au numéro de la provider identity
  // "phone-pass" RATTACHÉE À LA SESSION AUTHENTIFIÉE (auth_identity_id
  // extrait du JWT signé côté serveur, donc non falsifiable) - et non au
  // champ `customer.phone`, qui est un simple champ de profil modifiable
  // sans aucune revérification via la route cœur Medusa
  // `POST /store/customers/me` (voir
  // node_modules/@medusajs/medusa/dist/api/store/customers/validators.js :
  // `phone: z.string().nullish()`, aucune contrainte de propriété). Un
  // client authentifié aurait sinon pu copier dans son propre profil le
  // numéro de livraison d'une commande tierce, puis se l'approprier via
  // cette route : voir Task 13 report pour le détail de cette faille
  // évitée (déviation par rapport à l'exemple du brief, qui comparait à
  // `customer.phone`).
  const verifiedPhone = (
    authIdentity?.provider_identities as ProviderIdentityForClaim[] | undefined
  )?.find((identity) => identity.provider === "phone-pass")?.entity_id

  if (!orderPhone || !verifiedPhone || normalizePhone(orderPhone) !== normalizePhone(verifiedPhone)) {
    res.status(403).json({ message: "Cette commande n'appartient pas à ce compte." })
    return
  }

  try {
    const orderModuleService = req.scope.resolve(Modules.ORDER)
    await orderModuleService.updateOrders(order_id, { customer_id: customerId })
    res.status(200).json({ success: true })
  } catch (error) {
    logger.error("Échec du rattachement d'une commande au compte créé", error as Error)
    res.status(500).json({ message: "Une erreur est survenue." })
  }
}
