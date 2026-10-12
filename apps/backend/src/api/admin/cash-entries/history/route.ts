import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { monthlyHistory, PERIODS, periodHistory } from "../../../../lib/cashbook-rules"
import type { Period } from "../../../../lib/cashbook-rules"
import { loadAllEntries } from "../../../../lib/cashbook-query"

// Chiffre d'affaires, dépenses et résultat par période (?period=day|week|month|year) :
// 14 derniers jours, 12 semaines, 12 mois ou 5 années. `months` (12 derniers
// mois) reste renvoyé pour les anciens appels.
const COUNTS: Record<Period, number> = { day: 14, week: 12, month: 12, year: 5 }

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const entries = await loadAllEntries(req.scope)
  const requested = String(req.query.period ?? "") as Period
  const period: Period = PERIODS.includes(requested) ? requested : "month"
  res.json({
    period,
    rows: periodHistory(entries, period, new Date().toISOString().slice(0, 10), COUNTS[period]),
    months: monthlyHistory(entries, new Date(), 12),
  })
}
