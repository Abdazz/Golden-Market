import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { adjustInventoryLevelsStep } from "@medusajs/medusa/core-flows"
import { cancelCashEntry, orderCashEntry } from "../lib/procurement-rules"
import { recordAutoEntriesStep } from "./steps/cash-entry-steps"
import { prepareReceptionStep, recordCostsStep, saveDraftStep, setStatusStep, setVariantCostStep } from "./steps/procurement-steps"
import type { DraftInput } from "./steps/procurement-steps"

// Commandes fournisseurs (spec 2026-09-28 approvisionnement-marges).

export const saveSupplierOrderWorkflow = createWorkflow("save-supplier-order", function (input: DraftInput) {
  const order = saveDraftStep(input)
  return new WorkflowResponse(order)
})

// Commander : sortie de caisse « Achat de marchandises ».
export const placeSupplierOrderWorkflow = createWorkflow("place-supplier-order", function (input: { id: string }) {
  const status = transform({ input }, ({ input }) => ({ id: input.id, from: ["draft"], to: "ordered" as const }))
  const changed = setStatusStep(status)
  const entries = transform({ changed }, ({ changed }) => [orderCashEntry(changed.order, changed.order.lines ?? [])])
  recordAutoEntriesStep(entries)
  return new WorkflowResponse(changed.order)
})

// Réceptionner : stock augmenté, coûts de revient figés.
export const receiveSupplierOrderWorkflow = createWorkflow("receive-supplier-order", function (input: { id: string }) {
  const status = transform({ input }, ({ input }) => ({ id: input.id, from: ["ordered"], to: "received" as const }))
  const changed = setStatusStep(status)
  const adjustments = prepareReceptionStep({ order: changed.order })
  adjustInventoryLevelsStep(adjustments)
  recordCostsStep({ order: changed.order })
  return new WorkflowResponse(changed.order)
})

// Annuler : contrepassation de la sortie de caisse si la commande était passée.
export const cancelSupplierOrderWorkflow = createWorkflow("cancel-supplier-order", function (input: { id: string }) {
  const status = transform({ input }, ({ input }) => ({ id: input.id, from: ["draft", "ordered"], to: "canceled" as const }))
  const changed = setStatusStep(status)
  when({ changed }, ({ changed }) => changed.previousStatus === "ordered").then(() => {
    const entries = transform({ changed }, ({ changed }) => [cancelCashEntry(changed.order, changed.order.lines ?? [])])
    recordAutoEntriesStep(entries).config({ name: "record-cancel-entry" })
  })
  return new WorkflowResponse(changed.order)
})

// Coût de revient saisi à la main depuis l'onglet Marges.
export const setVariantCostWorkflow = createWorkflow(
  "set-variant-cost",
  function (input: { variant_id: string; unit_cost_xof: number }) {
    const cost = setVariantCostStep(input)
    return new WorkflowResponse(cost)
  }
)
