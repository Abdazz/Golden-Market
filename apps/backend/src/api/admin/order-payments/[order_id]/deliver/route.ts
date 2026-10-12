import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { markOrderDelivered } from "../../../../../lib/order-payment-form"

// "Marquer livrée" de la fiche commande : livraison seule (lib/order-payment-form.ts).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const { warning } = await markOrderDelivered(req.scope, req.params.order_id)
    res.json({ ok: true, warning })
  } catch (error) {
    res.status(400).json({ message: (error as Error).message })
  }
}
