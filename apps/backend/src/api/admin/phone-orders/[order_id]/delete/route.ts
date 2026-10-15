import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { deleteManualOrder } from "../../../../../lib/order-delete"

// "Supprimer la commande" : voir lib/order-delete.ts.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    await deleteManualOrder(req.scope, req.params.order_id, req.auth_context.actor_id)
  } catch (error) {
    res.status(400).json({ message: (error as Error).message })
    return
  }
  res.json({ order_id: req.params.order_id })
}
