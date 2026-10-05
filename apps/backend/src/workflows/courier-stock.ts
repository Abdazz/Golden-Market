import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, adjustInventoryLevelsStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import {
  createCourierStockMovementsStep,
  prepareDeliveryTakesStep,
  prepareManualMovementsStep,
} from "./steps/courier-stock-steps"
import type { ManualMovementInput } from "./steps/courier-stock-steps"

// Stock confié aux livreurs (spec 2026-09-28 stock-livreurs).

// Verrou commun à tous les mouvements : le dépôt est partagé entre livreurs ;
// deux mouvements simultanés liraient le même solde et pourraient le dépasser.
export const COURIER_STOCK_LOCK_KEY = "courier-stock"

// Remise / retour / correction. Seule la correction ajuste le stock Medusa
// (perte ou trouvaille : le stock total possédé change).
export const recordCourierStockWorkflow = createWorkflow("record-courier-stock", function (input: ManualMovementInput) {
  acquireLockStep({ key: COURIER_STOCK_LOCK_KEY, timeout: 10, ttl: 30 })
  const prepared = prepareManualMovementsStep(input)
  const movements = transform({ prepared }, ({ prepared }) => prepared.movements)
  const created = createCourierStockMovementsStep(movements)
  when({ prepared }, ({ prepared }) => prepared.adjustments.length > 0).then(() => {
    const adjustments = transform({ prepared }, ({ prepared }) => prepared.adjustments)
    adjustInventoryLevelsStep(adjustments)
  })
  releaseLockStep({ key: COURIER_STOCK_LOCK_KEY })
  return new WorkflowResponse(created)
})

// Livraison terminée : le livreur déstocke ce qu'il détient.
export const takeDeliveryStockWorkflow = createWorkflow("take-delivery-stock", function (input: { delivery_id: string }) {
  acquireLockStep({ key: COURIER_STOCK_LOCK_KEY, timeout: 10, ttl: 30 }).config({ name: "acquire-courier-stock-lock-delivery" })
  const movements = prepareDeliveryTakesStep(input)
  const created = createCourierStockMovementsStep(movements).config({ name: "create-delivery-stock-movements" })
  releaseLockStep({ key: COURIER_STOCK_LOCK_KEY }).config({ name: "release-courier-stock-lock-delivery" })
  return new WorkflowResponse(created)
})
