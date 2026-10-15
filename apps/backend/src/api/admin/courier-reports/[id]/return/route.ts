import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { returnCourierReport, sendReportError } from "../../../../../lib/courier-reports"

// Renvoyer un rapport au livreur pour correction (motif obligatoire).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    await returnCourierReport(req.scope, req.params.id, (req.body as { reason?: unknown } | undefined)?.reason)
    res.json({ ok: true })
  } catch (error) {
    sendReportError(req.scope, res, error, "Renvoi d'un rapport livreur")
  }
}
