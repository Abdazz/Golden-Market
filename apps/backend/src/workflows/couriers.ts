import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createCourierStep, updateCourierStep } from "./steps/delivery-steps"
import type { CourierInput } from "./steps/delivery-steps"

export const createCourierWorkflow = createWorkflow("create-courier", function (input: CourierInput) {
  const courier = createCourierStep(input)
  return new WorkflowResponse(courier)
})

export const updateCourierWorkflow = createWorkflow(
  "update-courier",
  function (input: CourierInput & { id: string; active?: boolean }) {
    const courier = updateCourierStep(input)
    return new WorkflowResponse(courier)
  }
)
