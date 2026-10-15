import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { validateCourierReport } from "../../../../../lib/courier-reports"

// Valider un rapport « Oui » : montant encaissé saisi ici pour une expédition seulement.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const { warning } = await validateCourierReport(req.scope, req.params.id, (req.body ?? {}) as { amount_collected?: unknown })
    res.json({ ok: true, warning })
  } catch (error) {
    const status = error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND ? 404 : 400
    res.status(status).json({ message: (error as Error).message })
  }
}
