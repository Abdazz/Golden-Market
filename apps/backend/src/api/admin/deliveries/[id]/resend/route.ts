import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { notifyCourier } from "../../../../../lib/delivery-service-helpers"

// "Renvoyer le message" au livreur.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await notifyCourier(req.scope, req.params.id))
}
