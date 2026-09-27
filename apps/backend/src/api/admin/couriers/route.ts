import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createCourierWorkflow } from "../../../workflows/couriers"
import type { CreateCourierSchema } from "../deliveries/middlewares"

const COURIER_FIELDS = ["id", "name", "phone", "active", "notes"]

// Livreurs : actifs d'abord, puis par nom.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "courier", fields: COURIER_FIELDS })
  const couriers = [...data].sort(
    (a: any, b: any) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "fr")
  )
  res.json({ couriers })
}

export async function POST(req: AuthenticatedMedusaRequest<CreateCourierSchema>, res: MedusaResponse) {
  const { result } = await createCourierWorkflow(req.scope).run({ input: req.validatedBody })
  res.json({ courier: result })
}
