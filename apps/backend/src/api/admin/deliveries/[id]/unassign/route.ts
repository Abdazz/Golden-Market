import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../../../../modules/delivery"
import type DeliveryModuleService from "../../../../../modules/delivery/service"
import { withDeliveryLock } from "../../../../../lib/courier-reports"
import { updateDeliveryWorkflow } from "../../../../../workflows/update-delivery"

// Retirer l'affectation d'une livraison en cours, sans la confier à un autre
// livreur (demandé le 2026-10-17). La tentative passe "Annulée" (comme à
// l'annulation d'une commande) : elle disparaît de l'espace du livreur et la
// commande revient dans "À confier". Le rapport non validé du livreur est
// supprimé, comme au changement de livreur.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(DELIVERY_MODULE) as DeliveryModuleService
  const out = await withDeliveryLock(req.scope, req.params.id, async () => {
    const delivery = await svc.retrieveDelivery(req.params.id)
    if (delivery.status !== "assigned") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Seule une livraison en cours peut être retirée.")
    }
    const reports = await svc.listDeliveryReports({ delivery_id: delivery.id })
    if (reports.some((r) => r.status === "validated")) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Le rapport du livreur est déjà validé : l'affectation ne peut plus être retirée.")
    }
    if (reports.length) await svc.deleteDeliveryReports(reports.map((r) => r.id))
    const { result } = await updateDeliveryWorkflow(req.scope).run({ input: { id: delivery.id, status: "canceled" } })
    return { delivery: result[0] ?? result }
  })
  res.json(out)
}
