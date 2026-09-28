import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { followUpProspectWorkflow } from "../../../../../workflows/prospects"
import type { FollowUpSchema } from "../../middlewares"

// "Relancé" : prochaine relance dans 3 jours (ou date choisie).
export async function POST(req: AuthenticatedMedusaRequest<FollowUpSchema>, res: MedusaResponse) {
  const { result } = await followUpProspectWorkflow(req.scope).run({ input: { id: req.params.id, next_on: req.validatedBody.next_on } })
  res.json({ prospect: result })
}
