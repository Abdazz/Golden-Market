import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import { prepareCompletionStep, updateDeliveryStep } from "./steps/delivery-steps"
import type { CompletionInput } from "./steps/delivery-steps"

// Livrée / Échec / Déposée à la gare. Verrou par livraison : deux clics
// simultanés passaient tous deux le contrôle « déjà terminée » et créaient
// deux fulfillments (stock Medusa baissé deux fois, constaté le 2026-09-28).
// Le second attend le verrou puis est refusé.
export const completeDeliveryWorkflow = createWorkflow("complete-delivery", function (input: CompletionInput) {
  const lockKey = transform({ input }, ({ input }) => `complete-delivery:${input.id}`)
  acquireLockStep({ key: lockKey, timeout: 10, ttl: 30 })
  const changes = prepareCompletionStep(input)
  const updated = updateDeliveryStep(changes)
  releaseLockStep({ key: lockKey })
  const delivery = transform({ updated }, ({ updated }) => updated[0])
  return new WorkflowResponse(delivery)
})
