import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { syncOrderAfterDelivery } from "../../../../../lib/delivery-order-sync"
import { completeDeliveryWorkflow } from "../../../../../workflows/complete-delivery"
import { updateDeliveryWorkflow } from "../../../../../workflows/update-delivery"
import type { CompleteDeliverySchema } from "../../middlewares"

// Livrée / Échec / Déposée à la gare, puis répercussion sur la commande
// (paiement, "Fulfillment") : un échec de synchronisation est enregistré comme
// avertissement, la livraison reste terminée.
export async function POST(req: AuthenticatedMedusaRequest<CompleteDeliverySchema>, res: MedusaResponse) {
  const { result: delivery } = await completeDeliveryWorkflow(req.scope).run({
    input: { id: req.params.id, ...req.validatedBody },
  })

  let syncWarning: string | null = null
  if (delivery.status === "delivered" || delivery.status === "shipped") {
    syncWarning = await syncOrderAfterDelivery(req.scope, {
      orderId: delivery.order_id,
      status: delivery.status,
      collected: delivery.amount_collected ?? 0,
    })
    if (syncWarning) {
      await updateDeliveryWorkflow(req.scope).run({ input: { id: delivery.id, sync_warning: syncWarning } })
    }
  }

  res.json({ delivery: { ...delivery, sync_warning: syncWarning }, sync_warning: syncWarning })
}
