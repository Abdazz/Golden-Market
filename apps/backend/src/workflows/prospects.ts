import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { convertProspectsStep, followUpStep, saveProspectStep, setProspectStatusStep } from "./steps/prospect-steps"
import type { ProspectValues } from "./steps/prospect-steps"

// Prospects à relancer (spec 2026-09-28 prospects).

export const saveProspectWorkflow = createWorkflow("save-prospect", function (input: ProspectValues) {
  return new WorkflowResponse(saveProspectStep(input))
})

export const followUpProspectWorkflow = createWorkflow(
  "follow-up-prospect",
  function (input: { id: string; next_on?: string | null }) {
    return new WorkflowResponse(followUpStep(input))
  }
)

export const setProspectStatusWorkflow = createWorkflow(
  "set-prospect-status",
  function (input: { id: string; status: "to_follow_up" | "waiting_stock" | "lost" }) {
    return new WorkflowResponse(setProspectStatusStep(input))
  }
)

export const convertProspectsWorkflow = createWorkflow(
  "convert-prospects",
  function (input: { ids: string[]; order_id: string }) {
    return new WorkflowResponse(convertProspectsStep(input))
  }
)
