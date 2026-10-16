import { Modules } from "@medusajs/framework/utils"
import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { loadUndoContext } from "../lib/order-undo"
import { COURIER_STOCK_LOCK_KEY } from "./courier-stock"
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

// Une seule annulation à la fois par commande ; si une livraison est terminée,
// mêmes verrous que sa clôture (complete-delivery) et les rapports du livreur
// (courier-report) ; « non livrée » prend aussi le verrou du stock livreur.
// Les contrôles sont refaits dans le workflow, une fois les verrous pris.
const withUndoLock = async <T>(scope: any, orderId: string, withStock: boolean, job: () => Promise<T>): Promise<T> => {
  const ctx = await loadUndoContext(scope, orderId)
  const id = ctx?.doneDelivery?.id
  const keys = [
    `order-undo:${orderId}`,
    ...(id ? [`complete-delivery:${id}`, `courier-report:${id}`] : []),
    ...(withStock ? [COURIER_STOCK_LOCK_KEY] : []),
  ]
  return scope.resolve(Modules.LOCKING).execute(keys, job, { timeout: 30 }) as Promise<T>
}

export const undoOrderPaid = (scope: any, orderId: string, userId: string | null) =>
  withUndoLock(scope, orderId, false, () => undoOrderPaidWorkflow(scope).run({ input: { order_id: orderId, user_id: userId } }))

export const undoOrderDelivered = (scope: any, orderId: string, userId: string | null) =>
  withUndoLock(scope, orderId, true, () => undoOrderDeliveredWorkflow(scope).run({ input: { order_id: orderId, user_id: userId } }))
