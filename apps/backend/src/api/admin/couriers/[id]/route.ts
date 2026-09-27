import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateCourierWorkflow } from "../../../../workflows/couriers"
import type { UpdateCourierSchema } from "../../deliveries/middlewares"

// Modification / activation / désactivation d'un livreur.
export async function POST(req: AuthenticatedMedusaRequest<UpdateCourierSchema>, res: MedusaResponse) {
  const { result } = await updateCourierWorkflow(req.scope).run({
    input: { id: req.params.id, ...req.validatedBody },
  })
  res.json({ courier: result })
}
