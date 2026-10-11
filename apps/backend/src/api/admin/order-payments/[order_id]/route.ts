import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { parsePaymentForm } from "../../../../lib/cashbook-rules"
import { paymentFormDefaults, submitPaymentForm } from "../../../../lib/order-payment-form"

// Formulaire "Marquer comme payée" de la fiche commande (voir
// lib/order-payment-form.ts) : GET -> valeurs pré-remplies, POST -> commande
// marquée payée et caisse de la commande remplacée par les montants saisis.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const defaults = await paymentFormDefaults(req.scope, req.params.order_id)
  if (!defaults) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Commande introuvable.")
  res.json(defaults)
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = parsePaymentForm((req.body ?? {}) as Record<string, unknown>)
  if (!parsed.ok) throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.message)
  const { amount, courier_fee, transport_fee } = parsed
  await submitPaymentForm(req.scope, req.params.order_id, { amount, courier_fee, transport_fee })
  res.json({ ok: true })
}
