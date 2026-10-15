import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../../../../modules/delivery"
import type DeliveryModuleService from "../../../../../modules/delivery/service"
import { updateDeliveryWorkflow } from "../../../../../workflows/update-delivery"
import type { ReassignDeliverySchema } from "../../middlewares"

// Changer le livreur d'une livraison en cours (demandé le 2026-10-15). Le stock
// livreur n'est touché qu'à la fin de la livraison : rien à déplacer ici.
export async function POST(req: AuthenticatedMedusaRequest<ReassignDeliverySchema>, res: MedusaResponse) {
  const svc = req.scope.resolve(DELIVERY_MODULE) as DeliveryModuleService
  const delivery = await svc.retrieveDelivery(req.params.id)
  if (delivery.status !== "assigned") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Seule une livraison en cours peut changer de livreur.")
  }
  const courier = await svc.retrieveCourier(req.validatedBody.courier_id)
  if (!courier.active) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Ce livreur n'est pas actif.")
  // Le nouveau livreur repart sans rapport : celui de l'ancien (non validé) est supprimé.
  if (courier.id !== delivery.courier_id) {
    const old = await svc.listDeliveryReports({ delivery_id: delivery.id })
    const stale = old.filter((r) => r.status !== "validated").map((r) => r.id)
    if (stale.length) await svc.deleteDeliveryReports(stale)
  }
  const { result } = await updateDeliveryWorkflow(req.scope).run({
    input: { id: delivery.id, courier_id: courier.id, whatsapp_status: "pending", whatsapp_error: null },
  })
  res.json({ delivery: result[0] ?? result, courier_name: courier.name })
}
