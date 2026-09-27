import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { updateDeliveryStep } from "./steps/delivery-steps"
import type { DeliveryChanges } from "./steps/delivery-steps"

// Mises à jour techniques d'une ou plusieurs livraisons : statut du message
// WhatsApp, avertissement de synchronisation, annulation, report nocturne.
export const updateDeliveryWorkflow = createWorkflow(
  "update-delivery",
  function (input: DeliveryChanges | DeliveryChanges[]) {
    const deliveries = updateDeliveryStep(input)
    return new WorkflowResponse(deliveries)
  }
)
