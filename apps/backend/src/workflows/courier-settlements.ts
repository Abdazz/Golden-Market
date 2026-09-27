import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { computeSettlementStep, createSettlementStep, deleteSettlementStep } from "./steps/delivery-steps"

// Valide le versement d'un livreur pour une journée (verrouille la journée).
export const validateSettlementWorkflow = createWorkflow(
  "validate-settlement",
  function (input: { courier_id: string; day: string; received_amount: number; note?: string | null }) {
    const expected = computeSettlementStep(input)
    const data = transform({ input, expected }, ({ input, expected }) => ({
      courier_id: input.courier_id,
      day: input.day,
      expected_amount: expected,
      received_amount: input.received_amount,
      note: input.note ?? null,
    }))
    const settlement = createSettlementStep(data)
    return new WorkflowResponse(settlement)
  }
)

// "Rouvrir la journée" : supprime le versement, les livraisons redeviennent modifiables.
export const reopenSettlementWorkflow = createWorkflow(
  "reopen-settlement",
  function (input: { id: string }) {
    const result = deleteSettlementStep(input)
    return new WorkflowResponse(result)
  }
)
