import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import type { NewEntry } from "../lib/cashbook-rules"
import {
  createManualEntryStep,
  deleteManualEntryStep,
  recordAutoEntriesStep,
  replaceOrderEntriesStep,
  updateManualEntryStep,
} from "./steps/cash-entry-steps"
import type { ManualEntryInput } from "./steps/cash-entry-steps"

// Journal de caisse (spec 2026-09-28 journal-de-caisse).

export const recordAutoEntriesWorkflow = createWorkflow("record-auto-entries", function (input: NewEntry[]) {
  const created = recordAutoEntriesStep(input)
  return new WorkflowResponse(created)
})

export const createManualEntryWorkflow = createWorkflow("create-manual-entry", function (input: ManualEntryInput) {
  const entry = createManualEntryStep(input)
  return new WorkflowResponse(entry)
})

export const updateManualEntryWorkflow = createWorkflow(
  "update-manual-entry",
  function (input: ManualEntryInput & { id: string }) {
    const entry = updateManualEntryStep(input)
    return new WorkflowResponse(entry)
  }
)

export const deleteManualEntryWorkflow = createWorkflow("delete-manual-entry", function (input: { id: string }) {
  const result = deleteManualEntryStep(input)
  return new WorkflowResponse(result)
})

export const replaceOrderEntriesWorkflow = createWorkflow(
  "replace-order-entries",
  function (input: { order_id: string; entries: NewEntry[] }) {
    const created = replaceOrderEntriesStep(input)
    return new WorkflowResponse(created)
  }
)
