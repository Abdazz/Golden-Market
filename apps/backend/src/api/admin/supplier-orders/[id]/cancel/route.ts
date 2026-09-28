import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { cancelSupplierOrderWorkflow } from "../../../../../workflows/supplier-orders"

// Annuler : contrepassation de la caisse si la commande était passée.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { result } = await cancelSupplierOrderWorkflow(req.scope).run({ input: { id: req.params.id } })
  res.json({ order: result })
}
