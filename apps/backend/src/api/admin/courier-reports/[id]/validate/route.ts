import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendReportError, validateCourierReport } from "../../../../../lib/courier-reports"

// Valider un rapport « Oui » : montant encaissé saisi ici pour une expédition
// seulement (vide : le client n'a pas encore payé).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const { warning } = await validateCourierReport(req.scope, req.params.id, (req.body ?? {}) as { amount_collected?: unknown })
    res.json({ ok: true, warning })
  } catch (error) {
    sendReportError(req.scope, res, error, "Validation d'un rapport livreur")
  }
}
