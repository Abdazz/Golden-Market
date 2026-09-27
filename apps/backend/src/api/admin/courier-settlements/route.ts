import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { validateSettlementWorkflow } from "../../../workflows/courier-settlements"
import type { ValidateSettlementSchema } from "../deliveries/middlewares"

// "Valider le versement" : montant attendu recalculé côté serveur, journée verrouillée.
export async function POST(req: AuthenticatedMedusaRequest<ValidateSettlementSchema>, res: MedusaResponse) {
  const { result } = await validateSettlementWorkflow(req.scope).run({ input: req.validatedBody })
  res.json({ settlement: result })
}
