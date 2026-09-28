import { parseLine } from "../../../lib/procurement-rules"
import type { LineValues } from "../../../workflows/steps/procurement-steps"
import type { DraftSchema } from "./middlewares"

// minimum : taux de change > 0, frais de transaction >= 0.
const rate = (value: unknown, fallback: number, allowZero = false) => {
  if (value === undefined || value === null || value === "") return fallback
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."))
  return Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) ? n : NaN
}

// Corps validé -> entrée du workflow de brouillon (message clair sinon).
export function toDraftInput(body: DraftSchema, id?: string) {
  const exchange_rate = rate(body.exchange_rate, 670)
  const fee_rate = rate(body.fee_rate, 0.0299, true)
  if (Number.isNaN(exchange_rate) || Number.isNaN(fee_rate)) {
    return { ok: false as const, message: "Taux de conversion ou frais de transaction invalides." }
  }
  const lines: LineValues[] = []
  for (const [index, raw] of body.lines.entries()) {
    const parsed = parseLine(raw)
    if (!parsed.ok) return { ok: false as const, message: `Ligne ${index + 1} : ${parsed.message}` }
    lines.push(parsed.values)
  }
  return {
    ok: true as const,
    input: {
      ...(id ? { id } : {}),
      reference: body.reference,
      supplier: body.supplier || null,
      exchange_rate,
      fee_rate,
      note: body.note || null,
      lines,
    },
  }
}
