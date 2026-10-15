import { cancelOrderWorkflow, updateOrderWorkflow } from "@medusajs/medusa/core-flows"
import { loadDeliveries, loadOrder, notDeletableReason } from "./order-edit"
import { updateDeliveryWorkflow } from "../workflows/update-delivery"

// "Supprimer la commande" (2026-10-15, demandé par le propriétaire) : Medusa ne
// supprime pas une commande ; on l'annule (stock libéré), on annule ses
// livraisons en cours et on la marque `metadata.deleted_at` pour la masquer de
// la liste (lib/order-list-delivery.ts).
export async function deleteManualOrder(scope: any, orderId: string, userId: string) {
  const order = await loadOrder(scope, orderId)
  if (!order) throw new Error("Commande introuvable.")
  const deliveries = await loadDeliveries(scope, orderId)
  const reason = notDeletableReason(order, deliveries)
  if (reason) throw new Error(`${reason} Elle ne peut pas être supprimée.`)

  const active = deliveries.filter((d) => d.status === "assigned")
  if (active.length) {
    await updateDeliveryWorkflow(scope).run({ input: active.map((d) => ({ id: d.id, status: "canceled" })) })
  }
  // Une commande annulée n'est plus modifiable : on la marque avant de l'annuler.
  const mark = (metadata: Record<string, unknown>) =>
    updateOrderWorkflow(scope).run({ input: { id: orderId, user_id: userId, metadata } })
  await mark({ ...(order.metadata ?? {}), deleted_at: new Date().toISOString() })
  try {
    await cancelOrderWorkflow(scope).run({ input: { order_id: orderId, canceled_by: userId } })
  } catch (error) {
    await mark({ ...(order.metadata ?? {}), deleted_at: "" })
    throw error
  }
}
