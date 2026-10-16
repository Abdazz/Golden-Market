import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { parsePaymentForm } from "../../../../lib/cashbook-rules"
import { paymentFormDefaults, submitPaymentForm } from "../../../../lib/order-payment-form"
import { undoAvailability } from "../../../../lib/order-undo"

// Formulaire "Marquer comme payée" de la fiche commande (voir
// lib/order-payment-form.ts) : GET -> valeurs pré-remplies, POST -> commande
// marquée payée et caisse de la commande remplacée par les montants saisis ;
// delivered: true -> commande (et livraison en cours) marquée livrée.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const defaults = await paymentFormDefaults(req.scope, req.params.order_id)
  if (!defaults) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Commande introuvable.")
  // Boutons « Marquer non payée / non livrée » (fenêtre de 24 h, lib/undo-rules.ts).
  res.json({ ...defaults, undo: await undoAvailability(req.scope, req.params.order_id) })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = parsePaymentForm((req.body ?? {}) as Record<string, unknown>)
  if (!parsed.ok) throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.message)
  const { amount, courier_fee, transport_fee } = parsed
  const delivered = (req.body as { delivered?: unknown } | undefined)?.delivered === true
  const { warning } = await submitPaymentForm(req.scope, req.params.order_id, { amount, courier_fee, transport_fee }, { delivered })
  res.json({ ok: true, warning })
}
