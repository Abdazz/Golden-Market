import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadVariantInfos, withCosts } from "../../../../lib/procurement-query"
import { PROCUREMENT_MODULE } from "../../../../modules/procurement"
import { saveSupplierOrderWorkflow } from "../../../../workflows/supplier-orders"
import { toDraftInput } from "../draft-input"
import type { DraftSchema } from "../middlewares"

// Fiche d'une commande fournisseur : lignes calculées (prix de revient, prix
// de vente actuel, marge).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(PROCUREMENT_MODULE) as any
  const order = await svc.retrieveSupplierOrder(req.params.id, { relations: ["lines"] })
  res.json({ order: withCosts(order, await loadVariantInfos(req.scope)) })
}

export async function POST(req: AuthenticatedMedusaRequest<DraftSchema>, res: MedusaResponse) {
  const draft = toDraftInput(req.validatedBody, req.params.id)
  if (!draft.ok) {
    res.status(400).json({ message: draft.message })
    return
  }
  const { result } = await saveSupplierOrderWorkflow(req.scope).run({ input: draft.input })
  res.json({ order: result })
}
