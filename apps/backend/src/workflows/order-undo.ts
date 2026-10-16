import { Modules } from "@medusajs/framework/utils"
import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { loadUndoContext } from "../lib/order-undo"
import { COURIER_STOCK_LOCK_KEY } from "./courier-stock"
import { recordAutoEntriesStep } from "./steps/cash-entry-steps"
import { updateDeliveryStep } from "./steps/delivery-steps"
import {
  eraseFulfillmentsStep,
  prepareUndoDeliveredStep,
  prepareUndoPaidStep,
  removeOrderTransactionsStep,
  resetPaymentsStep,
  softDeleteCashEntriesStep,
  softDeleteCourierMovementsStep,
  updateDeliveryReportStep,
  updateOrderMetadataStep,
  type UndoInput,
} from "./steps/order-undo-steps"

// « Marquer non payée » / « Marquer non livrée » (2026-10-16, lib/order-undo.ts).

export const undoOrderPaidWorkflow = createWorkflow("undo-order-paid", function (input: UndoInput) {
  const plan = prepareUndoPaidStep(input)
  softDeleteCashEntriesStep(transform({ plan }, ({ plan }) => plan.cash_ids))
  // Après la suppression : frais de la livraison restée livrée (idempotent par référence, compensé).
  recordAutoEntriesStep(transform({ plan }, ({ plan }) => plan.fee_entries.map((e) => ({ ...e, date: new Date(e.date) }))))
  when({ plan }, ({ plan }) => !!plan.delivery).then(() => {
    updateDeliveryStep(transform({ plan }, ({ plan }) => plan.delivery!)).config({ name: "undo-paid-update-delivery" })
  })
  updateOrderMetadataStep(transform({ plan, input }, ({ plan, input }) => ({ order_id: input.order_id, metadata: plan.metadata })))
  removeOrderTransactionsStep(transform({ plan, input }, ({ plan, input }) => ({ order_id: input.order_id, ids: plan.transaction_ids })))
  resetPaymentsStep(transform({ plan }, ({ plan }) => plan.collections))
  return new WorkflowResponse({ ok: true })
})

export const undoOrderDeliveredWorkflow = createWorkflow("undo-order-delivered", function (input: UndoInput) {
  const plan = prepareUndoDeliveredStep(input)
  when({ plan }, ({ plan }) => !!plan.delivery).then(() => {
    updateDeliveryStep(transform({ plan }, ({ plan }) => plan.delivery!)).config({ name: "undo-delivered-update-delivery" })
  })
  when({ plan }, ({ plan }) => !!plan.report).then(() => {
    updateDeliveryReportStep(transform({ plan }, ({ plan }) => plan.report!))
  })
  softDeleteCourierMovementsStep(transform({ plan }, ({ plan }) => plan.movement_ids))
  softDeleteCashEntriesStep(transform({ plan }, ({ plan }) => plan.cash_ids))
  updateOrderMetadataStep(transform({ plan, input }, ({ plan, input }) => ({ order_id: input.order_id, metadata: plan.metadata })))
  eraseFulfillmentsStep(transform({ plan, input }, ({ plan, input }) => ({ order_id: input.order_id, fulfillments: plan.fulfillments })))
  return new WorkflowResponse({ ok: true })
})

// Une seule annulation à la fois par commande, puis mêmes verrous que la
// validation d'un rapport (courier-report -> complete-delivery -> courier-stock,
// même ordre : pas d'attente croisée). Verrous imbriqués un par un : le
// fournisseur en mémoire se bloque lui-même sur une liste de clés dont l'une
// est occupée. Les contrôles sont refaits dans le workflow, verrous pris.
const withUndoLock = async <T>(scope: any, orderId: string, kind: "paid" | "delivered", job: () => Promise<T>): Promise<T> => {
  const ctx = await loadUndoContext(scope, orderId)
  // « non payée » : aussi la livraison en cours (validation d'un rapport en parallèle).
  const id = ctx?.doneDelivery?.id ?? (kind === "paid" ? ctx?.openDelivery?.id : undefined)
  const keys = [
    `order-undo:${orderId}`,
    ...(id ? [`courier-report:${id}`, `complete-delivery:${id}`] : []),
    ...(kind === "delivered" ? [COURIER_STOCK_LOCK_KEY] : []),
  ]
  const locking = scope.resolve(Modules.LOCKING)
  const nest = (i: number): Promise<T> => (i === keys.length ? job() : locking.execute(keys[i], () => nest(i + 1), { timeout: 30 }))
  return nest(0)
}

export const undoOrderPaid = (scope: any, orderId: string, userId: string | null) =>
  withUndoLock(scope, orderId, "paid", () => undoOrderPaidWorkflow(scope).run({ input: { order_id: orderId, user_id: userId } }))

export const undoOrderDelivered = (scope: any, orderId: string, userId: string | null) =>
  withUndoLock(scope, orderId, "delivered", () => undoOrderDeliveredWorkflow(scope).run({ input: { order_id: orderId, user_id: userId } }))
