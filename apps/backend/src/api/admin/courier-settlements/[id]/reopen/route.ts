import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { reopenSettlementWorkflow } from "../../../../../workflows/courier-settlements"

// "Rouvrir la journée" : les livraisons redeviennent modifiables.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await reopenSettlementWorkflow(req.scope).run({ input: { id: req.params.id } })
  res.json({ id: req.params.id, reopened: true })
}
