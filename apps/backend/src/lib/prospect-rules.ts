import { normalizePhone } from "./normalize-phone"

// Règles des prospects à relancer (spec 2026-09-28 prospects) : fonctions
// pures, testées.

export type ProspectStatus = "to_follow_up" | "waiting_stock" | "converted" | "lost"
export type ProspectLike = {
  id: string
  phone: string
  status: ProspectStatus
  follow_up_on: string | null
  variant_id: string | null
}

export const FOLLOW_UP_DELAY_DAYS = 3
const DATE = /^\d{4}-\d{2}-\d{2}$/

export const addDays = (day: string, days: number): string => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const tryNormalize = (phone: unknown): string | null => {
  try {
    return normalizePhone(String(phone ?? ""))
  } catch {
    return null
  }
}

export const parseProspect = (
  body: { phone?: unknown; name?: unknown; variant_id?: unknown; product_label?: unknown; status?: unknown; follow_up_on?: unknown; note?: unknown },
  today: string
):
  | {
      ok: true
      values: {
        phone: string
        name: string | null
        variant_id: string | null
        product_label: string | null
        status: "to_follow_up" | "waiting_stock"
        follow_up_on: string | null
        note: string | null
      }
    }
  | { ok: false; message: string } => {
  const phone = tryNormalize(body.phone)
  if (!phone) return { ok: false, message: "Numéro WhatsApp invalide (8 chiffres, avec ou sans +226)." }
  const status = body.status === "waiting_stock" ? "waiting_stock" : "to_follow_up"
  let follow_up_on: string | null = null
  if (status === "to_follow_up") {
    const requested = typeof body.follow_up_on === "string" ? body.follow_up_on.trim() : ""
    if (requested && !DATE.test(requested)) return { ok: false, message: "Date de relance invalide." }
    follow_up_on = requested || addDays(today, 1)
  }
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)
  return {
    ok: true,
    values: {
      phone,
      name: text(body.name),
      variant_id: text(body.variant_id),
      product_label: text(body.product_label),
      status,
      follow_up_on,
      note: text(body.note),
    },
  }
}

// À relancer aujourd'hui (ou en retard), les retards d'abord.
export const dueToday = <T extends ProspectLike>(prospects: T[], today: string): (T & { overdue: boolean })[] =>
  prospects
    .filter((p) => p.status === "to_follow_up" && p.follow_up_on && p.follow_up_on <= today)
    .sort((a, b) => (a.follow_up_on ?? "").localeCompare(b.follow_up_on ?? ""))
    .map((p) => ({ ...p, overdue: (p.follow_up_on ?? "") < today }))

// Fiches à convertir quand une commande est passée avec ce numéro.
export const matchProspectsForOrder = <T extends ProspectLike>(prospects: T[], phone: string | null | undefined): T[] => {
  const normalized = tryNormalize(phone)
  if (!normalized) return []
  return prospects.filter((p) => p.phone === normalized && p.status !== "converted")
}

// En attente de stock : produits de nouveau disponibles en premier.
export const sortWaiting = <T extends ProspectLike>(
  prospects: T[],
  availability: Record<string, boolean>
): (T & { available: boolean | null })[] => {
  const rank = (a: boolean | null) => (a === true ? 0 : a === false ? 1 : 2)
  return prospects
    .filter((p) => p.status === "waiting_stock")
    .map((p) => ({ ...p, available: p.variant_id && p.variant_id in availability ? availability[p.variant_id] : null }))
    .sort((a, b) => rank(a.available) - rank(b.available))
}
