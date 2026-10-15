import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listCouriersOfDay, todayInOuaga } from "../../../lib/courier-reports"

// Livreurs à qui des commandes ont été confiées un jour donné (défaut : aujourd'hui), avec leur synthèse.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? "")) ? String(req.query.date) : todayInOuaga()
  res.json({ date, couriers: await listCouriersOfDay(req.scope, date) })
}
