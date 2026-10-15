import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createCourierWorkflow } from "../../../workflows/couriers"
import type { CreateCourierSchema } from "../deliveries/middlewares"

const COURIER_FIELDS = ["id", "name", "phone", "active", "notes", "pin_hash"]

// Livreurs : actifs d'abord, puis par nom.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "courier", fields: COURIER_FIELDS })
  const couriers = [...data]
    .map(({ pin_hash, ...c }: any) => ({ ...c, has_pin: Boolean(pin_hash) }))
    .sort((a: any, b: any) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "fr"))
  res.json({ couriers })
}

export async function POST(req: AuthenticatedMedusaRequest<CreateCourierSchema>, res: MedusaResponse) {
  const { result } = await createCourierWorkflow(req.scope).run({ input: req.validatedBody })
  const { pin_hash, ...courier } = result as any
  res.json({ courier: { ...courier, has_pin: Boolean(pin_hash) } })
}
