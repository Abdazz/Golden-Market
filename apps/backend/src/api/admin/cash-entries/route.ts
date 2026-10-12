import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { monthOf, parseManualEntry, PERIODS, periodRange, rowsByOrder, summarizeRange, withRunningBalance } from "../../../lib/cashbook-rules"
import type { Period } from "../../../lib/cashbook-rules"
import { loadAllEntries } from "../../../lib/cashbook-query"
import { createManualEntryWorkflow } from "../../../workflows/cash-entries"
import type { ManualEntrySchema } from "./middlewares"

// Journal de caisse d'une période (2026-10-12) : jour, semaine, mois ou année
// (?period=day|week|month|year&date=AAAA-MM-JJ ; mois en cours par défaut ;
// ?month=AAAA-MM reste accepté). Écritures avec le solde après chacune (plus
// récentes en haut), totaux de la période, solde actuel.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const requestedPeriod = String(req.query.period ?? "") as Period
  const period: Period = PERIODS.includes(requestedPeriod) ? requestedPeriod : "month"
  const requestedDate = String(req.query.date ?? "")
  const requestedMonth = String(req.query.month ?? "")
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : /^\d{4}-\d{2}$/.test(requestedMonth)
    ? `${requestedMonth}-01`
    : new Date().toISOString().slice(0, 10)
  const range = periodRange(period, date)
  const all = await loadAllEntries(req.scope)
  const summary = summarizeRange(all, range)
  const inRange = (e: { date: Date | string }) => {
    const t = new Date(e.date).getTime()
    return t >= range.start.getTime() && t < range.end.getTime()
  }
  const entries = withRunningBalance(all.filter(inRange), summary.balanceBefore).reverse()
  // Une ligne par commande (entrée et frais sur la même ligne), plus récentes en haut.
  const rows = rowsByOrder(all.filter(inRange), summary.balanceBefore).reverse()
  const balance = all.reduce((sum, e) => sum + (e.direction === "in" ? e.amount : -e.amount), 0)
  res.json({
    period,
    date,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    month: monthOf(range.start),
    entries,
    rows,
    summary,
    balance,
  })
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
