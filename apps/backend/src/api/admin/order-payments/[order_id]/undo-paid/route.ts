import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendReportError } from "../../../../../lib/courier-reports"
import { undoOrderPaid } from "../../../../../workflows/order-undo"

// « Marquer non payée » (2026-10-16, lib/order-undo.ts) : 24 h après la dernière action « payée ».
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    await undoOrderPaid(req.scope, req.params.order_id, req.auth_context?.actor_id ?? null)
    res.json({ ok: true })
  } catch (error) {
    sendReportError(req.scope, res, error, `Marquer non payée ${req.params.order_id}`)
  }
}
