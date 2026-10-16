import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { decryptPin } from "../../../lib/courier-auth"
import { createCourierWorkflow } from "../../../workflows/couriers"
import type { CreateCourierSchema } from "../deliveries/middlewares"

const COURIER_FIELDS = ["id", "name", "phone", "active", "notes", "pin_hash", "pin_cipher"]

// Livreurs : actifs d'abord, puis par nom.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "courier", fields: COURIER_FIELDS })
  const couriers = [...data]
    // Le PIN en clair ne sort que de cette route admin (null pour un PIN défini avant le chiffrement).
    .map(({ pin_hash, pin_cipher, ...c }: any) => ({ ...c, has_pin: Boolean(pin_hash), pin: decryptPin(pin_cipher, process.env.COOKIE_SECRET ?? "") }))
    .sort((a: any, b: any) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "fr"))
  res.json({ couriers })
}

export async function POST(req: AuthenticatedMedusaRequest<CreateCourierSchema>, res: MedusaResponse) {
  const { result } = await createCourierWorkflow(req.scope).run({ input: req.validatedBody })
  const { pin_hash, pin_cipher, ...courier } = result as any
  res.json({ courier: { ...courier, has_pin: Boolean(pin_hash) } })
}
