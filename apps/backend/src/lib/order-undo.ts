import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CASHBOOK_MODULE } from "../modules/cashbook"
import { finalReferences } from "./cashbook-rules"
import { undoStatus, type UndoFacts } from "./undo-rules"

// « Marquer non payée » / « Marquer non livrée » (2026-10-16, demandé par le
// propriétaire, enquête .superpowers/sdd/2026-10-15-espace-livreur/spike-undo-report.md) :
// la commande revient exactement à l'état d'avant, sans remboursement Medusa.
// Lecture commune à la fiche (GET /admin/order-payments/:id) et aux workflows.

export type UndoContext = Awaited<ReturnType<typeof loadUndoContext>>

export async function loadUndoContext(scope: any, orderId: string) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "metadata",
      "payment_collections.id",
      "payment_collections.payments.id",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.payment_session_id",
      "payment_collections.payments.captures.id",
      "payment_collections.payments.captures.created_at",
      "payment_collections.payments.refunds.id",
      "fulfillments.id",
      "fulfillments.location_id",
      "fulfillments.shipped_at",
      "fulfillments.delivered_at",
      "fulfillments.canceled_at",
      "fulfillments.items.inventory_item_id",
    ],
    filters: { id: orderId },
  })
  if (!order) return null
  const { data: deliveries } = await query.graph({
    entity: "delivery",
    fields: ["id", "status", "completed_at", "courier_id", "amount_collected", "assigned_at"],
    filters: { order_id: orderId },
  })
  const [finalSale] = await scope.resolve(CASHBOOK_MODULE).listCashEntries({ reference: [finalReferences(orderId).sale] })
  const payments = (order.payment_collections ?? []).flatMap((pc: any) => pc.payments ?? [])
  const captures = payments.flatMap((p: any) => p.captures ?? [])
  const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null)
  const facts: UndoFacts = {
    canceled: order.status === "canceled",
    paid: captures.length > 0,
    refunded: payments.some((p: any) => (p.refunds ?? []).length > 0),
    finalSaleAt: iso(finalSale?.date),
    captureDates: captures.map((c: any) => iso(c.created_at) as string),
    deliveries: (deliveries as any[]).map((d) => ({ status: d.status, completed_at: iso(d.completed_at) })),
    fulfillments: (order.fulfillments ?? []).map((f: any) => ({
      shipped_at: iso(f.shipped_at),
      delivered_at: iso(f.delivered_at),
      canceled_at: iso(f.canceled_at),
    })),
  }
  // Dernière livraison terminée (livrée / expédiée) : celle qu'on défait.
  const doneDelivery =
    (deliveries as any[])
      .filter((d) => d.status === "delivered" || d.status === "shipped")
      .sort((a, b) => new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime())[0] ?? null
  return { order, deliveries: deliveries as any[], doneDelivery, finalSale: finalSale ?? null, captures, facts }
}

export async function undoAvailability(scope: any, orderId: string) {
  const ctx = await loadUndoContext(scope, orderId)
  return ctx ? undoStatus(ctx.facts) : null
}
