import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateCourierWorkflow } from "../../../../workflows/couriers"
import type { UpdateCourierSchema } from "../../deliveries/middlewares"

// Modification / activation / désactivation d'un livreur.
export async function POST(req: AuthenticatedMedusaRequest<UpdateCourierSchema>, res: MedusaResponse) {
  const { result } = await updateCourierWorkflow(req.scope).run({
    input: { id: req.params.id, ...req.validatedBody },
  })
  const { pin_hash, ...courier } = result as any
  res.json({ courier: { ...courier, has_pin: Boolean(pin_hash) } })
}
