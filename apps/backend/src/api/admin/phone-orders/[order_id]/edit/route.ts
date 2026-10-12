import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { orderEditDefaults, submitOrderEdit } from "../../../../../lib/order-edit"
import { parsePhoneOrderInput } from "../../../../../lib/phone-order"

// "Modifier la commande" (voir lib/order-edit.ts) : GET -> valeurs actuelles
// et raison éventuelle de blocage, POST -> mêmes champs que la création.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const defaults = await orderEditDefaults(req.scope, req.params.order_id)
  if (!defaults) {
    res.status(404).json({ message: "Commande introuvable." })
    return
  }
  res.json(defaults)
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = parsePhoneOrderInput(req.body)
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message })
    return
  }
  try {
    await submitOrderEdit(req.scope, req.params.order_id, parsed.input, req.auth_context.actor_id)
  } catch (error) {
    res.status(400).json({ message: (error as Error).message })
    return
  }
  res.json({ order_id: req.params.order_id })
}
