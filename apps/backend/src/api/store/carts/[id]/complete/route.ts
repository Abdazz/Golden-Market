// apps/backend/src/api/store/carts/[id]/complete/route.ts
//
// Override du core route Medusa pour ajouter, uniquement pour une commande
// invité (customer_id absent), un jeton de création de compte à usage
// unique - voir l'addendum "Jeton de création de compte" du Task 13. Le
// reste de ce fichier reproduit le core route à l'identique (voir
// node_modules/@medusajs/medusa/dist/api/store/carts/[id]/complete/route.js).
import { completeCartWorkflowId } from "@medusajs/core-flows"
import { prepareRetrieveQuery } from "@medusajs/framework"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { refetchCart } from "@medusajs/medusa/api/store/carts/helpers"
import { defaultStoreCartFields } from "@medusajs/medusa/api/store/carts/query-config"
import {
  buildOrderRegistrationTokenMetadata,
  generateOrderRegistrationToken,
} from "../../../../../lib/order-registration-token"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const cart_id = req.params.id
  const we = req.scope.resolve(Modules.WORKFLOW_ENGINE)

  const { errors, result, transaction } = await we.run(completeCartWorkflowId, {
    input: { id: cart_id },
    throwOnError: false,
  })

  if (!transaction.hasFinished()) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Cart is already being completed by another request"
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Identique au core route : une erreur récupérable (paiement) renvoie le
  // panier + l'erreur avec un statut 200 pour laisser le client réagir.
  if (errors?.[0]) {
    const error = errors[0].error as { type?: string; message: string; name: string }
    const statusOKErrors = [
      MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
      MedusaError.Types.PAYMENT_REQUIRES_MORE_ERROR,
    ]

    const cartReq = await prepareRetrieveQuery({}, { defaults: defaultStoreCartFields }, req)
    const cart = await refetchCart(cart_id, req.scope, cartReq.remoteQueryConfig.fields)

    if (!statusOKErrors.includes(error?.type as typeof statusOKErrors[number])) {
      throw error
    }

    res.status(200).json({
      type: "cart",
      cart,
      error: {
        message: error.message,
        name: error.name,
        type: error.type,
      },
    })
    return
  }

  // Ajout par rapport au core route : commande invité uniquement.
  let registrationToken: string | undefined

  const orderModuleService = req.scope.resolve(Modules.ORDER)
  const existingOrder = await orderModuleService.retrieveOrder(result.id, {
    select: ["id", "customer_id", "metadata"],
  })

  if (!existingOrder.customer_id) {
    registrationToken = generateOrderRegistrationToken()
    await orderModuleService.updateOrders(result.id, {
      metadata: {
        ...existingOrder.metadata,
        ...buildOrderRegistrationTokenMetadata(registrationToken),
      },
    })
  }

  const { data } = await query.graph({
    entity: "order",
    fields: (req as unknown as { queryConfig: { fields: string[] } }).queryConfig.fields,
    filters: { id: result.id },
  })

  res.status(200).json({
    type: "order",
    order: data[0],
    ...(registrationToken ? { registration_token: registrationToken } : {}),
  })
}
