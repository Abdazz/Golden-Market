import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, getTotalVariantAvailability } from "@medusajs/framework/utils"
import { todayInOuaga } from "../../../lib/delivery-rules"
import { computeAvailability } from "../../../lib/meta-catalog-mapping"
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
  const titles: Record<string, string> = {}
  const availability: Record<string, boolean> = {}
  if (variantIds.length) {
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "title", "manage_inventory", "allow_backorder", "product.title", "product.handle"],
      filters: { id: variantIds },
    })
    const stock = await getTotalVariantAvailability(query, { variant_ids: variants.map((v: any) => v.id) })
    for (const v of variants) {
      // Variante unique de Medusa ("Default Title") : le nom du produit suffit.
      const generic = !v.title || ["Default Title", "Default variant"].includes(v.title)
      titles[v.id] = v.product?.title ? (generic ? v.product.title : `${v.product.title} - ${v.title}`) : v.title
      availability[v.id] = computeAvailability(v, stock[v.id]?.availability ?? null) === "in stock"
    }
  }
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
