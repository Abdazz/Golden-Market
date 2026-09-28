import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { adjustInventoryLevelsStep } from "@medusajs/medusa/core-flows"
import {
  createCourierStockMovementsStep,
  prepareDeliveryTakesStep,
  prepareManualMovementsStep,
} from "./steps/courier-stock-steps"
import type { ManualMovementInput } from "./steps/courier-stock-steps"

// Stock confié aux livreurs (spec 2026-09-28 stock-livreurs).

// Remise / retour / correction. Seule la correction ajuste le stock Medusa
// (perte ou trouvaille : le stock total possédé change).
export const recordCourierStockWorkflow = createWorkflow("record-courier-stock", function (input: ManualMovementInput) {
  const prepared = prepareManualMovementsStep(input)
  const movements = transform({ prepared }, ({ prepared }) => prepared.movements)
  const created = createCourierStockMovementsStep(movements)
  when({ prepared }, ({ prepared }) => prepared.adjustments.length > 0).then(() => {
    const adjustments = transform({ prepared }, ({ prepared }) => prepared.adjustments)
    adjustInventoryLevelsStep(adjustments)
  })
  return new WorkflowResponse(created)
})

// Livraison terminée : le livreur déstocke ce qu'il détient.
export const takeDeliveryStockWorkflow = createWorkflow("take-delivery-stock", function (input: { delivery_id: string }) {
  const movements = prepareDeliveryTakesStep(input)
  const created = createCourierStockMovementsStep(movements).config({ name: "create-delivery-stock-movements" })
  return new WorkflowResponse(created)
})
