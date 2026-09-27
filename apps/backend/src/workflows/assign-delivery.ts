import { Modules } from "@medusajs/framework/utils"
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createRemoteLinkStep } from "@medusajs/medusa/core-flows"
import { DELIVERY_MODULE } from "../modules/delivery"
import { assertCanAssignStep, createDeliveryStep } from "./steps/delivery-steps"
import type { NewDelivery } from "./steps/delivery-steps"

// Confie une commande à un livreur : une tentative de livraison + lien
// order -> delivery (ordre du defineLink de src/links/order-delivery.ts).
export const assignDeliveryWorkflow = createWorkflow(
  "assign-delivery",
  function (input: NewDelivery & { order_canceled: boolean }) {
    assertCanAssignStep(input)
    const fields = transform({ input }, ({ input }) => ({
      order_id: input.order_id,
      courier_id: input.courier_id,
      type: input.type,
      address: input.address,
      transport_company: input.transport_company,
      destination_city: input.destination_city,
      amount_to_collect: input.amount_to_collect,
    }))
    const delivery = createDeliveryStep(fields)
    const links = transform({ delivery, input }, ({ delivery, input }) => [
      {
        [Modules.ORDER]: { order_id: input.order_id },
        [DELIVERY_MODULE]: { delivery_id: delivery.id },
      },
    ])
    createRemoteLinkStep(links)
    return new WorkflowResponse(delivery)
  }
)
