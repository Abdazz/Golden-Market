import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { monthOf } from "../../../lib/cashbook-rules"
import { computeMonthMargin, loadVariantCosts } from "../../../lib/procurement-margin"
import { margin } from "../../../lib/procurement-rules"
import { loadVariantInfos } from "../../../lib/procurement-query"

// Marges (spec 2026-09-28 approvisionnement-marges) : par variante (coût de
// revient courant, prix de vente, marge) et marge brute du mois sur les
// commandes encaissées ce mois-là (ventes du journal de caisse).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const requested = String(req.query.month ?? "")
  const month = /^\d{4}-\d{2}$/.test(requested) ? requested : monthOf(new Date())
  const infos = await loadVariantInfos(req.scope)
  const costs = await loadVariantCosts(req.scope)

  const variants = [...infos.entries()]
    .map(([variant_id, info]) => {
      const unitCost = costs.get(variant_id) ?? null
      const m = margin(unitCost, info.price)
      return { variant_id, ...info, unit_cost_xof: unitCost, margin_xof: m.unit, margin_percent: m.percent }
    })
    .sort((a, b) => (a.product_title + (a.variant_title ?? "")).localeCompare(b.product_title + (b.variant_title ?? ""), "fr"))

  res.json({ month, variants, month_margin: await computeMonthMargin(req.scope, month, costs) })
}
