import type { MedusaResponse } from "@medusajs/framework/http"
import { DELIVERY_MODULE } from "../../../modules/delivery"
import type DeliveryModuleService from "../../../modules/delivery/service"
import { reportFields } from "../../../lib/courier-report-rules"
import { loadCourierDay, todayInOuaga } from "../../../lib/courier-reports"
import type { CourierRequest } from "../middlewares"

// Commandes du jour du livreur connecté. Seules les informations utiles au
// livreur sortent : jamais le montant à encaisser d'une expédition (il ne le
// connaît pas), ni les autres livreurs, ni la caisse.
export async function GET(req: CourierRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(DELIVERY_MODULE) as DeliveryModuleService
  const courier = await svc.retrieveCourier(req.courier_id).catch(() => null)
  if (!courier || !courier.active) {
    res.status(401).json({ message: "Session expirée : reconnectez-vous." })
    return
  }
  const date = todayInOuaga()
  const lines = await loadCourierDay(req.scope, courier.id, date)
  res.json({
    courier: { id: courier.id, name: courier.name },
    date,
    deliveries: lines.filter((l) => l.state !== "canceled").map((l) => {
      const fields = reportFields(l.type, l.amount_to_collect)
      return {
        id: l.id,
        order_number: l.order_number,
        customer_name: l.customer_name,
        customer_phone: l.customer_phone,
        place: l.place,
        type: l.type,
        items: l.items,
        amount_to_collect: l.type === "express" ? l.amount_to_collect : null,
        fields,
        state: l.state,
        failure_reason: l.failure_reason,
        report: l.report && {
          delivered: l.report.delivered,
          failure_reason: l.report.failure_reason,
          // Expédition : le montant saisi par l'équipe n'est jamais montré au livreur.
          amount_collected: fields.amount_collected ? l.report.amount_collected : null,
          courier_fee: l.report.courier_fee,
          transport_fee: l.report.transport_fee,
          return_reason: l.report.return_reason,
          status: l.report.status,
        },
      }
    }),
  })
}
