import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendReportError } from "../../../../../lib/courier-reports"
import { undoOrderDelivered } from "../../../../../workflows/order-undo"

// « Marquer non livrée » (2026-10-16, lib/order-undo.ts) : 24 h après la dernière action « livrée ».
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    await undoOrderDelivered(req.scope, req.params.order_id, req.auth_context?.actor_id ?? null)
    res.json({ ok: true })
  } catch (error) {
    sendReportError(req.scope, res, error, `Marquer non livrée ${req.params.order_id}`)
  }
}
