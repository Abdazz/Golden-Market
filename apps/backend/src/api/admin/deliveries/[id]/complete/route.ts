import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { feeEntriesFromDelivery } from "../../../../../lib/cashbook-rules"
import { orderNumberOf } from "../../../../../lib/order-number"
import { recordAutoEntriesWorkflow } from "../../../../../workflows/cash-entries"
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

  // Frais livreur / compagnie -> sorties du journal de caisse (spec
  // 2026-09-28 journal-de-caisse). Jamais bloquant pour la livraison.
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [courier],
    } = await query.graph({ entity: "courier", fields: ["name"], filters: { id: delivery.courier_id } })
    const {
      data: [order],
    } = await query.graph({ entity: "order", fields: ["id", "custom_display_id", "display_id"], filters: { id: delivery.order_id } })
    const entries = feeEntriesFromDelivery(delivery, courier?.name ?? null, order ? orderNumberOf(order) : null)
    if (entries.length) await recordAutoEntriesWorkflow(req.scope).run({ input: entries })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(
      `Journal de caisse : frais de la livraison ${delivery.id} non inscrits (${(error as Error).message})`
    )
  }

  res.json({ delivery: { ...delivery, sync_warning: syncWarning }, sync_warning: syncWarning })
}
