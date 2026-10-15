// Rapport de livraison du livreur (spec 2026-10-15 espace-livreur) : règles pures,
// testées, partagées par les routes livreur, les routes admin et lib/courier-reports.ts.

export type DeliveryType = "express" | "expedition"

export type ReportValues =
  | { delivered: true; failure_reason: null; amount_collected: number | null; courier_fee: number; transport_fee: number | null }
  | { delivered: false; failure_reason: string; amount_collected: null; courier_fee: null; transport_fee: null }

// Champs montrés au livreur : en expédition le client paie l'entreprise par
// Mobile Money, le livreur ne connaît pas ce montant (il ne le voit jamais).
export const reportFields = (type: DeliveryType) => ({
  amount_collected: type === "express",
  transport_fee: type === "expedition",
  courier_fee: true as const,
})

const wholeAmount = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN
  return Number.isInteger(n) && n >= 0 ? n : null
}

export const parseReport = (
  type: DeliveryType,
  body: { delivered?: unknown; failure_reason?: unknown; amount_collected?: unknown; courier_fee?: unknown; transport_fee?: unknown }
): { ok: true; values: ReportValues } | { ok: false; message: string } => {
  if (typeof body.delivered !== "boolean") return { ok: false, message: "Indiquez si la commande a été livrée." }
  if (!body.delivered) {
    const reason = typeof body.failure_reason === "string" ? body.failure_reason.trim() : ""
    if (!reason) return { ok: false, message: "Indiquez pourquoi la commande n'a pas été livrée." }
    return {
      ok: true,
      values: { delivered: false, failure_reason: reason, amount_collected: null, courier_fee: null, transport_fee: null },
    }
  }
  const fields = reportFields(type)
  const courierFee = wholeAmount(body.courier_fee)
  if (courierFee === null) return { ok: false, message: "Course du livreur invalide : nombre entier en F CFA (0 si aucune)." }
  let amountCollected: number | null = null
  if (fields.amount_collected) {
    amountCollected = wholeAmount(body.amount_collected)
    if (amountCollected === null || amountCollected <= 0) {
      return { ok: false, message: "Indiquez le montant encaissé (nombre entier positif en F CFA)." }
    }
  }
  let transportFee: number | null = null
  if (fields.transport_fee) {
    transportFee = wholeAmount(body.transport_fee)
    if (transportFee === null) return { ok: false, message: "Frais Expédition invalides : nombre entier en F CFA (0 si aucun)." }
  }
  return {
    ok: true,
    values: { delivered: true, failure_reason: null, amount_collected: amountCollected, courier_fee: courierFee, transport_fee: transportFee },
  }
}

export type LineState = "todo" | "submitted" | "returned" | "validated" | "failed" | "canceled"

// État affiché d'une livraison du jour, d'après la livraison et son rapport éventuel.
export const reportState = (delivery: { status: string }, report: { status: string } | null): LineState => {
  if (delivery.status === "canceled") return "canceled"
  if (delivery.status === "delivered" || delivery.status === "shipped") return "validated"
  if (delivery.status === "failed") return "failed"
  if (report?.status === "submitted") return "submitted"
  if (report?.status === "returned") return "returned"
  return "todo"
}

export const summarizeDay = (states: LineState[]) => {
  const counted = states.filter((s) => s !== "canceled")
  const count = (state: LineState) => counted.filter((s) => s === state).length
  return {
    total: counted.length,
    todo: count("todo"),
    submitted: count("submitted"),
    returned: count("returned"),
    validated: count("validated"),
    failed: count("failed"),
  }
}
