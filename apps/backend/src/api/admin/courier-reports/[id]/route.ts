import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DELIVERY_MODULE } from "../../../../modules/delivery"
import type DeliveryModuleService from "../../../../modules/delivery/service"
import { loadCourierDay, todayInOuaga } from "../../../../lib/courier-reports"

// Commandes du jour d'un livreur avec leur rapport (toutes les informations utiles au tableau).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? "")) ? String(req.query.date) : todayInOuaga()
  const svc = req.scope.resolve(DELIVERY_MODULE) as DeliveryModuleService
  const courier = await svc.retrieveCourier(req.params.id).catch(() => null)
  if (!courier) {
    res.status(404).json({ message: "Livreur introuvable." })
    return
  }
  res.json({
    date,
    courier: { id: courier.id, name: courier.name, phone: courier.phone },
    lines: await loadCourierDay(req.scope, courier.id, date),
  })
}
