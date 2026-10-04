import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadOrdersToAssign } from "../../../../lib/delivery-to-assign"

// Commandes à confier (règle dans lib/delivery-to-assign, partagée avec le tableau de bord).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json({ orders: await loadOrdersToAssign(req.scope) })
}
