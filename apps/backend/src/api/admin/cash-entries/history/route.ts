import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { monthlyHistory } from "../../../../lib/cashbook-rules"
import { loadAllEntries } from "../../../../lib/cashbook-query"

// Chiffre d'affaires, dépenses et résultat des 12 derniers mois.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json({ months: monthlyHistory(await loadAllEntries(req.scope), new Date(), 12) })
}
