import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { setProspectStatusWorkflow } from "../../../../../workflows/prospects"
import type { StatusSchema } from "../../middlewares"

// Perdu / remettre à relancer / en attente de stock.
export async function POST(req: AuthenticatedMedusaRequest<StatusSchema>, res: MedusaResponse) {
  const { result } = await setProspectStatusWorkflow(req.scope).run({ input: { id: req.params.id, status: req.validatedBody.status } })
  res.json({ prospect: result })
}
