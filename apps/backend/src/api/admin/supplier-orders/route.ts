import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { withCosts } from "../../../lib/procurement-query"
import { PROCUREMENT_MODULE } from "../../../modules/procurement"
import { saveSupplierOrderWorkflow } from "../../../workflows/supplier-orders"
import { toDraftInput } from "./draft-input"
import type { DraftSchema } from "./middlewares"

// Commandes fournisseurs, les plus récentes en haut, avec leurs totaux.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(PROCUREMENT_MODULE) as any
  const orders = await svc.listSupplierOrders({}, { relations: ["lines"], order: { created_at: "DESC" } })
  res.json({
    orders: orders.map((o: any) => {
      const { lines, ...rest } = withCosts(o)
      return { ...rest, line_count: lines.length }
    }),
  })
}

export async function POST(req: AuthenticatedMedusaRequest<DraftSchema>, res: MedusaResponse) {
  const draft = toDraftInput(req.validatedBody)
  if (!draft.ok) {
    res.status(400).json({ message: draft.message })
    return
  }
  const { result } = await saveSupplierOrderWorkflow(req.scope).run({ input: draft.input })
  res.json({ order: result })
}
