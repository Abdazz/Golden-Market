import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { parseManualEntry } from "../../../../lib/cashbook-rules"
import { deleteManualEntryWorkflow, updateManualEntryWorkflow } from "../../../../workflows/cash-entries"
import type { ManualEntrySchema } from "../middlewares"

// Modification / suppression d'une écriture saisie à la main (les écritures
// automatiques sont refusées par le workflow).
export async function POST(req: AuthenticatedMedusaRequest<ManualEntrySchema>, res: MedusaResponse) {
  const parsed = parseManualEntry(req.validatedBody)
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message })
    return
  }
  const { result } = await updateManualEntryWorkflow(req.scope).run({ input: { id: req.params.id, ...parsed.values } })
  res.json({ entry: result })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await deleteManualEntryWorkflow(req.scope).run({ input: { id: req.params.id } })
  res.json({ id: req.params.id, deleted: true })
}
