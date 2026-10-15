import type { MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { submitCourierReport } from "../../../../../lib/courier-reports"
import type { CourierRequest } from "../../../middlewares"

// Le livreur envoie ou corrige le rapport d'une de ses livraisons.
export async function POST(req: CourierRequest, res: MedusaResponse) {
  try {
    const { report } = await submitCourierReport(req.scope, req.courier_id, req.params.id, (req.body ?? {}) as Record<string, unknown>)
    // L'avertissement de synchronisation est destiné à l'équipe : il n'est pas
    // renvoyé au livreur (il reste inscrit sur la livraison).
    res.json({ report: { status: report.status, delivered: report.delivered } })
  } catch (error) {
    const status = error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND ? 404 : 400
    res.status(status).json({ message: (error as Error).message })
  }
}
