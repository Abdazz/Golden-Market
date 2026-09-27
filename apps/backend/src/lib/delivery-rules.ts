// Règles métier des livraisons (spec 2026-09-28 livreurs-livraisons) :
// fonctions pures, testées, utilisées par les workflows, les routes admin et le
// job de report.

import { normalizePhone } from "./normalize-phone"

export type DeliveryType = "express" | "expedition"
export type DeliveryStatus = "assigned" | "delivered" | "failed" | "shipped" | "canceled"

export type DeliveryLike = {
  status: DeliveryStatus
  type: DeliveryType
  tour_date: string
  completed_at: Date | string | null
  amount_to_collect: number
  amount_collected: number | null
  courier_fee: number | null
  transport_fee: number | null
}

// Burkina Faso : UTC+0 toute l'année.
export const dayOf = (date: Date | string): string => new Date(date).toISOString().slice(0, 10)
export const todayInOuaga = (now: Date = new Date()): string => dayOf(now)

// Ouagadougou -> livraison express ; toute autre ville -> expédition.
export const defaultTypeForCity = (city: string | null | undefined): DeliveryType => {
  const c = (city ?? "").trim().toLowerCase()
  return c === "" || c.startsWith("ouaga") ? "express" : "expedition"
}

// Figé au moment de confier la commande. Une expédition n'est jamais encaissée
// par le livreur (le client paie par Orange/Moov Money avant ou après l'envoi).
export const computeAmountToCollect = (input: {
  type: DeliveryType
  paymentStatus: string
  outstanding: number
}): number => {
  if (input.type === "expedition") return 0
  if (input.paymentStatus === "captured" || input.paymentStatus === "completed") return 0
  return Math.max(0, Math.round(input.outstanding))
}

// Une seule tentative en cours par commande.
export const canAssign = (existing: { status: DeliveryStatus }[]): boolean =>
  !existing.some((d) => d.status === "assigned")

const TERMINAL: DeliveryStatus[] = ["delivered", "failed", "shipped"]

// Montant que le livreur doit reverser pour une journée : seules comptent les
// livraisons terminées ce jour-là (une livraison reportée n'est jamais comptée
// avant d'avoir été faite). Peut être négatif.
export const computeSettlement = (deliveries: DeliveryLike[], day: string) => {
  const done = deliveries.filter(
    (d) => TERMINAL.includes(d.status) && d.completed_at && dayOf(d.completed_at) === day
  )
  const sum = (pick: (d: DeliveryLike) => number | null) => done.reduce((s, d) => s + (pick(d) ?? 0), 0)
  const collected = sum((d) => (d.status === "delivered" ? d.amount_collected : 0))
  const courierFees = sum((d) => d.courier_fee)
  const transportFees = sum((d) => d.transport_fee)
  return { collected, courierFees, transportFees, toRemit: collected - courierFees - transportFees, completedCount: done.length }
}

const amount = (value: unknown): number | null | "invalid" => {
  if (value === undefined || value === null || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isInteger(n) && n >= 0 ? n : "invalid"
}

export const validateCompletion = (input: {
  status: "delivered" | "failed" | "shipped"
  type: DeliveryType
  amount_collected?: unknown
  courier_fee?: unknown
  transport_fee?: unknown
  failure_reason?: unknown
}):
  | { ok: true; values: { amount_collected: number | null; courier_fee: number | null; transport_fee: number | null; failure_reason: string | null } }
  | { ok: false; message: string } => {
  const collected = amount(input.amount_collected)
  const courierFee = amount(input.courier_fee)
  const transportFee = amount(input.transport_fee)
  if (collected === "invalid" || courierFee === "invalid" || transportFee === "invalid") {
    return { ok: false, message: "Montants invalides : nombres entiers positifs en F CFA." }
  }
  const reason = typeof input.failure_reason === "string" ? input.failure_reason.trim() : ""
  if (input.status === "delivered" && collected === null) {
    return { ok: false, message: "Indiquez le montant encaissé (0 si rien n'a été encaissé)." }
  }
  if (input.status === "failed" && !reason) {
    return { ok: false, message: "Indiquez le motif de l'échec." }
  }
  if (input.status === "shipped" && input.type !== "expedition") {
    return { ok: false, message: "« Déposée à la gare » est réservé aux expéditions." }
  }
  return {
    ok: true,
    values: {
      amount_collected: input.status === "delivered" ? collected : null,
      courier_fee: courierFee,
      transport_fee: input.type === "expedition" ? transportFee : null,
      failure_reason: input.status === "failed" ? reason : null,
    },
  }
}

// Saisie d'un livreur : nom obligatoire, numéro WhatsApp burkinabè normalisé
// (+226XXXXXXXX) pour que le message de livraison parte au bon numéro.
export const parseCourierInput = (body: {
  name?: unknown
  phone?: unknown
  notes?: unknown
}):
  | { ok: true; values: { name: string; phone: string; notes: string | null } }
  | { ok: false; message: string } => {
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) return { ok: false, message: "Le nom du livreur est obligatoire." }
  try {
    return {
      ok: true,
      values: { name, phone: normalizePhone(String(body?.phone ?? "")), notes: body?.notes ? String(body.notes) : null },
    }
  } catch {
    return { ok: false, message: "Numéro WhatsApp invalide (8 chiffres, avec ou sans +226)." }
  }
}

// Report automatique : une livraison confiée et pas faite le jour prévu passe
// au jour courant (même livreur) - ni échec ni nouvelle tentative, pas de frais.
export const postponeUpdates = (
  deliveries: { id: string; status: string; tour_date: string; postponed_count: number }[],
  today: string
): { id: string; tour_date: string; postponed_count: number }[] =>
  deliveries
    .filter((d) => d.status === "assigned" && d.tour_date < today)
    .map((d) => ({ id: d.id, tour_date: today, postponed_count: d.postponed_count + 1 }))
