import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { finishDelivery } from "../../../../../lib/delivery-completion"
import { completeDeliveryWorkflow } from "../../../../../workflows/complete-delivery"
import type { CompleteDeliverySchema } from "../../middlewares"

// Livrée / Échec / Déposée à la gare, puis répercussion sur la commande
// (paiement, "Fulfillment"), déstockage du livreur et frais au journal de
// caisse (lib/delivery-completion.ts) : un échec de synchronisation ou de
// déstockage est enregistré comme avertissement, la livraison reste terminée.
export async function POST(req: AuthenticatedMedusaRequest<CompleteDeliverySchema>, res: MedusaResponse) {
  const { result: delivery } = await completeDeliveryWorkflow(req.scope).run({
    input: { id: req.params.id, ...req.validatedBody },
  })
  const { warning, stockWarning, stockTaken, courierName } = await finishDelivery(req.scope, delivery)
  res.json({
    delivery: { ...delivery, sync_warning: warning },
    sync_warning: warning,
    stock_warning: stockWarning,
    stock_taken: stockTaken,
    courier_name: courierName,
  })
}
