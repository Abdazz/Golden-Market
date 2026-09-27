// Client des routes admin livreurs / livraisons / versements (spec
// 2026-09-28 livreurs-livraisons), partagé par le widget de la fiche commande
// et la page "Livraisons". fetch + cookie de session, comme les autres écrans
// du projet (routes/whatsapp-conversations, routes/phone-orders).

export type DeliveryStatus = "assigned" | "delivered" | "failed" | "shipped" | "canceled"
export type DeliveryType = "express" | "expedition"

export type Courier = { id: string; name: string; phone: string; active: boolean; notes: string | null }

export type TourLine = {
  id: string
  order_id: string
  order_number: string
  courier_id: string
  courier_name: string | null
  customer_name: string
  customer_phone: string
  place: string
  items: { title: string; quantity: number }[]
  type: DeliveryType
  status: DeliveryStatus
  order_canceled: boolean
  tour_date: string
  postponed_from: string | null
  assigned_at: string
  completed_at: string | null
  amount_to_collect: number
  amount_collected: number | null
  courier_fee: number | null
  transport_fee: number | null
  failure_reason: string | null
  redeliver: boolean
  whatsapp_status: "pending" | "sent" | "failed"
  whatsapp_error: string | null
  sync_warning: string | null
}

export type Settlement = {
  collected: number
  courierFees: number
  transportFees: number
  toRemit: number
  completedCount: number
}

export type ValidatedSettlement = {
  id: string
  expected_amount: number
  received_amount: number
  validated_at: string
  note: string | null
}

export type OrderToAssign = {
  id: string
  order_number: string
  created_at: string
  customer_name: string
  customer_phone: string
  city: string | null
  address: string | null
  total: number
  paid: boolean
  redeliver: boolean
}

export type UnpaidExpedition = {
  order_id: string
  order_number: string
  customer_name: string
  customer_phone: string
  transport_company: string | null
  destination_city: string | null
  shipped_at: string
  total: number
  outstanding: number
}

export type AssignResult = {
  deliveries: { id: string; order_id: string; whatsapp_status: string; whatsapp_error: string | null }[]
  errors: { order_id: string; message: string }[]
}

// Compagnies de transport habituelles (saisie libre possible).
export const TRANSPORT_COMPANIES = ["STAF", "TSR", "Rakieta", "SOGEBAF", "TCV"]
export const FEE_SHORTCUTS = [1000, 1500]
export const FAILURE_REASONS = ["Client absent", "Client injoignable", "Refus du client"]

export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  assigned: "Confiée",
  delivered: "Livrée",
  failed: "Échec",
  shipped: "Déposée à la gare",
  canceled: "Annulée",
}

export const TYPE_LABELS: Record<DeliveryType, string> = {
  express: "Express",
  expedition: "Expédition",
}

export const STATUS_BADGE: Record<DeliveryStatus, string> = {
  assigned: "bg-ui-tag-blue-bg text-ui-tag-blue-text",
  delivered: "bg-ui-tag-green-bg text-ui-tag-green-text",
  shipped: "bg-ui-tag-green-bg text-ui-tag-green-text",
  failed: "bg-ui-tag-red-bg text-ui-tag-red-text",
  canceled: "bg-ui-tag-neutral-bg text-ui-tag-neutral-text",
}

export const formatXof = (amount: number | null | undefined) =>
  `${new Intl.NumberFormat("fr-FR").format(Number(amount ?? 0)).replace(/ | /g, " ")} F`

// "2026-09-27" -> "27/09"
export const formatDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`

// Aujourd'hui à l'heure de Ouagadougou (UTC toute l'année).
export const todayInOuaga = () => new Date().toISOString().slice(0, 10)

// Ouagadougou -> express ; toute autre ville -> expédition (même règle que le serveur).
export const defaultTypeForCity = (city: string | null | undefined): DeliveryType => {
  const c = (city ?? "").trim().toLowerCase()
  return c === "" || c.startsWith("ouaga") ? "express" : "expedition"
}

export async function api<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Messages de validation Zod de Medusa : "Invalid request: ..." -> message lisible.
    const message = String((data as { message?: string }).message ?? `Erreur ${res.status}`)
    throw new Error(message.replace(/^Invalid request: /, ""))
  }
  return data as T
}

// Champ montant saisi -> entier, ou null si vide.
export const parseAmount = (value: string): number | null => {
  const cleaned = value.replace(/\s/g, "")
  if (cleaned === "") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n) : NaN
}
