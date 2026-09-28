import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { placeSupplierOrderWorkflow } from "../../../../../workflows/supplier-orders"

// Commander : sortie de caisse « Achat de marchandises ».
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { result } = await placeSupplierOrderWorkflow(req.scope).run({ input: { id: req.params.id } })
  res.json({ order: result })
}
