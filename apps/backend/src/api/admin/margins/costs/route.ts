import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { setVariantCostWorkflow } from "../../../../workflows/supplier-orders"
import type { VariantCostSchema } from "../../supplier-orders/middlewares"

// Coût de revient d'une variante saisi à la main (stock acheté avant l'outil).
export async function POST(req: AuthenticatedMedusaRequest<VariantCostSchema>, res: MedusaResponse) {
  const { result } = await setVariantCostWorkflow(req.scope).run({ input: req.validatedBody })
  res.json({ cost: result })
}
