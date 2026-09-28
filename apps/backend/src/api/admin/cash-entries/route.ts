import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { monthOf, parseManualEntry, summarizeMonth, withRunningBalance } from "../../../lib/cashbook-rules"
import { loadAllEntries } from "../../../lib/cashbook-query"
import { createManualEntryWorkflow } from "../../../workflows/cash-entries"
import type { ManualEntrySchema } from "./middlewares"

// Journal de caisse d'un mois (AAAA-MM, mois courant par défaut) : écritures
// avec le solde après chacune (plus récentes en haut), totaux, solde actuel.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const requested = String(req.query.month ?? "")
  const month = /^\d{4}-\d{2}$/.test(requested) ? requested : monthOf(new Date())
  const all = await loadAllEntries(req.scope)
  const summary = summarizeMonth(all, month)
  const entries = withRunningBalance(
    all.filter((e) => monthOf(e.date) === month),
    summary.balanceBefore
  ).reverse()
  const balance = all.reduce((sum, e) => sum + (e.direction === "in" ? e.amount : -e.amount), 0)
  res.json({ month, entries, summary, balance })
}

export async function POST(req: AuthenticatedMedusaRequest<ManualEntrySchema>, res: MedusaResponse) {
  const parsed = parseManualEntry(req.validatedBody)
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message })
    return
  }
  const { result } = await createManualEntryWorkflow(req.scope).run({ input: parsed.values })
  res.json({ entry: result })
}
