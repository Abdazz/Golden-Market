import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { prepareCompletionStep, updateDeliveryStep } from "./steps/delivery-steps"
import type { CompletionInput } from "./steps/delivery-steps"

// Livrée / Échec / Déposée à la gare.
export const completeDeliveryWorkflow = createWorkflow("complete-delivery", function (input: CompletionInput) {
  const changes = prepareCompletionStep(input)
  const updated = updateDeliveryStep(changes)
  const delivery = transform({ updated }, ({ updated }) => updated[0])
  return new WorkflowResponse(delivery)
})
