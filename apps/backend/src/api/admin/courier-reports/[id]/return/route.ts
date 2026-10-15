import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { returnCourierReport } from "../../../../../lib/courier-reports"

// Renvoyer un rapport au livreur pour correction (motif obligatoire).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    await returnCourierReport(req.scope, req.params.id, (req.body as { reason?: unknown } | undefined)?.reason)
    res.json({ ok: true })
  } catch (error) {
    const status = error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND ? 404 : 400
    res.status(status).json({ message: (error as Error).message })
  }
}
