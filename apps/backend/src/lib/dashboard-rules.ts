import { monthOf, type EntryLike } from "./cashbook-rules"
import { computeSettlement, dayOf, type DeliveryLike } from "./delivery-rules"

// Règles du tableau de bord (spec 2026-10-04 tableau-de-bord) : fonctions
// pures, chaque chiffre réutilise la règle de la page détaillée correspondante.

export type CourierDelivery = DeliveryLike & { courier_id: string }
export type Totals = { count: number; amount: number }
export type Block<T> = ({ available: true } & T) | { available: false }

const TERMINAL = ["delivered", "failed", "shipped"]
const EXCLUDED_ORDER_STATUSES = ["canceled", "draft", "archived"]

// Argent à récupérer : pour chaque livreur, journées terminées sans versement
// validé, montant de chaque journée calculé comme dans l'onglet Tournée.
// Une journée à 0 (rien encaissé, aucun frais) n'est pas de l'argent à récupérer.
export const unremittedByCourier = (
  deliveries: CourierDelivery[],
  validated: { courier_id: string; day: string }[]
) => {
  const validatedKeys = new Set(validated.map((v) => `${v.courier_id}|${v.day}`))
  const groups = new Map<string, { courier_id: string; day: string; deliveries: CourierDelivery[] }>()
  for (const d of deliveries) {
    if (!TERMINAL.includes(d.status) || !d.completed_at) continue
    const day = dayOf(d.completed_at)
    const key = `${d.courier_id}|${day}`
    if (validatedKeys.has(key)) continue
    const group = groups.get(key) ?? { courier_id: d.courier_id, day, deliveries: [] }
    group.deliveries.push(d)
    groups.set(key, group)
  }
  const byCourier = new Map<string, { courier_id: string; amount: number; days: number }>()
  for (const g of groups.values()) {
    const amount = computeSettlement(g.deliveries, g.day).toRemit
    if (amount === 0) continue
    const entry = byCourier.get(g.courier_id) ?? { courier_id: g.courier_id, amount: 0, days: 0 }
    entry.amount += amount
    entry.days += 1
    byCourier.set(g.courier_id, entry)
  }
  return [...byCourier.values()]
}

export const countInProgress = (deliveries: { status: string; tour_date: string }[], today: string) => {
  const inProgress = deliveries.filter((d) => d.status === "assigned")
  return { count: inProgress.length, late: inProgress.filter((d) => d.tour_date < today).length }
}

export const orderedTotals = (
  orders: { created_at: Date | string; total: number | string | null; status: string }[],
  today: string,
  month: string
): { today: Totals; month: Totals } => {
  const result = { today: { count: 0, amount: 0 }, month: { count: 0, amount: 0 } }
  for (const o of orders) {
    if (EXCLUDED_ORDER_STATUSES.includes(o.status) || monthOf(o.created_at) !== month) continue
    const amount = Number(o.total ?? 0)
    result.month.count += 1
    result.month.amount += amount
    if (dayOf(o.created_at) === today) {
      result.today.count += 1
      result.today.amount += amount
    }
  }
  return result
}

// Même définition que le chiffre d'affaires de summarizeMonth : ventes moins remboursements.
export const collectedTotals = (entries: EntryLike[], today: string, month: string) => {
  const result = { today: 0, month: 0 }
  for (const e of entries) {
    const signed = e.category === "sale" ? e.amount : e.category === "refund" ? -e.amount : 0
    if (!signed || monthOf(e.date) !== month) continue
    result.month += signed
    if (dayOf(e.date) === today) result.today += signed
  }
  return result
}

// Chaque bloc est chargé indépendamment : un échec (base du chat injoignable...)
// rend ce seul bloc indisponible.
export const settleBlocks = async <L extends Record<string, () => Promise<object>>>(
  loaders: L,
  log: (key: string, error: unknown) => void = (key, error) => console.error(`[dashboard] ${key} :`, error)
): Promise<{ [K in keyof L]: Block<Awaited<ReturnType<L[K]>>> }> => {
  const keys = Object.keys(loaders) as (keyof L & string)[]
  const settled = await Promise.allSettled(keys.map((k) => loaders[k]()))
  const result = {} as Record<string, unknown>
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") result[keys[i]] = { available: true, ...s.value }
    else {
      log(keys[i], s.reason)
      result[keys[i]] = { available: false }
    }
  })
  return result as { [K in keyof L]: Block<Awaited<ReturnType<L[K]>>> }
}
