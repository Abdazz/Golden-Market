import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { todayInOuaga } from "../../../lib/delivery-rules"
import { loadVariantSummaries } from "../../../lib/prospect-query"
import { dueToday, parseProspect, sortWaiting } from "../../../lib/prospect-rules"
import { PROSPECTS_MODULE } from "../../../modules/prospects"
import { saveProspectWorkflow } from "../../../workflows/prospects"
import type { ProspectSchema } from "./middlewares"

// Prospects : à relancer aujourd'hui (retards d'abord), en attente de stock
// (de nouveau disponibles d'abord), tous (recherche numéro / nom).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(PROSPECTS_MODULE) as any
  const all = await svc.listProspects({}, { order: { updated_at: "DESC" } })
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const variantIds = [...new Set(all.map((p: any) => p.variant_id).filter(Boolean))] as string[]
  const { titles, availability } = await loadVariantSummaries(query, variantIds)
  const withTitle = (p: any) => ({ ...p, product: p.variant_id ? titles[p.variant_id] ?? p.product_label : p.product_label })
  const q = String(req.query.q ?? "").trim().toLowerCase()
  const digits = q.replace(/\D/g, "")
  const today = todayInOuaga()
  res.json({
    today,
    due: dueToday(all, today).map(withTitle),
    waiting: sortWaiting(all, availability).map(withTitle),
    all: all
      .filter((p: any) => !q || (p.name ?? "").toLowerCase().includes(q) || (digits.length >= 3 && p.phone.includes(digits)))
      .map(withTitle),
  })
}

export async function POST(req: AuthenticatedMedusaRequest<ProspectSchema>, res: MedusaResponse) {
  const parsed = parseProspect(req.validatedBody, todayInOuaga())
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message })
    return
  }
  const { result } = await saveProspectWorkflow(req.scope).run({ input: parsed.values })
  res.json({ prospect: result })
}
