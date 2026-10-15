import type { MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
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
    if (error instanceof MedusaError) {
      const known = [MedusaError.Types.NOT_FOUND, MedusaError.Types.NOT_ALLOWED, MedusaError.Types.INVALID_DATA]
      if (known.includes(error.type as any)) {
        res.status(error.type === MedusaError.Types.NOT_FOUND ? 404 : 400).json({ message: error.message })
        return
      }
    }
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(`Rapport livreur : ${(error as Error).message}`)
    res.status(500).json({ message: "Une erreur est survenue, réessayez." })
  }
}
