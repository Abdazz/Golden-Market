import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { receiveSupplierOrderWorkflow } from "../../../../../workflows/supplier-orders"

// Réceptionner : stock augmenté, coûts de revient figés.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { result } = await receiveSupplierOrderWorkflow(req.scope).run({ input: { id: req.params.id } })
  res.json({ order: result })
}
