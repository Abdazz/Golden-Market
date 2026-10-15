import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DELIVERY_MODULE } from "../../../../../modules/delivery"
import type DeliveryModuleService from "../../../../../modules/delivery/service"
import { hashPin } from "../../../../../lib/courier-auth"
import type { SetPinSchema } from "../../../deliveries/middlewares"

// Créer ou réinitialiser le PIN d'un livreur (spec 2026-10-15 espace-livreur).
export async function POST(req: AuthenticatedMedusaRequest<SetPinSchema>, res: MedusaResponse) {
  const svc = req.scope.resolve(DELIVERY_MODULE) as DeliveryModuleService
  const courier = await svc.retrieveCourier(req.params.id)
  await svc.updateCouriers({ id: courier.id, pin_hash: await hashPin(req.validatedBody.pin) })
  res.json({ ok: true })
}
