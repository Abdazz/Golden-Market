// Règles du journal de caisse (spec 2026-09-28 journal-de-caisse) : fonctions
// pures, testées, utilisées par les workflows, les abonnés et les routes admin.

export type Direction = "in" | "out"
export type Category =
  | "sale"
  | "refund"
  | "courier_fee"
  | "transport_fee"
  | "purchase"
  | "advertising"
  | "opening_balance"
  | "other_in"
  | "other_out"

export type EntryLike = {
  id: string
  date: Date | string
  direction: Direction
  amount: number
  category: Category
}

export type NewEntry = {
  date: Date
  direction: Direction
  amount: number
  category: Category
  label: string
  source: "auto" | "manual"
  reference: string | null
  order_id: string | null
}

// Catégories qu'on peut saisir à la main, selon le sens.
const MANUAL_CATEGORIES: Record<Direction, Category[]> = {
  in: ["opening_balance", "other_in"],
  out: ["purchase", "advertising", "other_out"],
}

export const monthOf = (date: Date | string): string => new Date(date).toISOString().slice(0, 7)

const signed = (e: EntryLike) => (e.direction === "in" ? e.amount : -e.amount)
const time = (e: EntryLike) => new Date(e.date).getTime()

export const parseManualEntry = (
  body: { direction?: unknown; category?: unknown; amount?: unknown; label?: unknown; note?: unknown; date?: unknown },
  now: Date = new Date()
):
  | { ok: true; values: { direction: Direction; category: Category; amount: number; label: string; note: string | null; date: Date } }
  | { ok: false; message: string } => {
  const direction = body.direction
  if (direction !== "in" && direction !== "out") return { ok: false, message: "Choisissez entrée ou sortie." }
  const category = body.category as Category
  if (!MANUAL_CATEGORIES[direction].includes(category)) {
    return { ok: false, message: "Catégorie incompatible avec le sens de l'écriture." }
  }
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount)
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: "Montant invalide : nombre entier positif en F CFA." }
  }
  const label = typeof body.label === "string" ? body.label.trim() : ""
  if (!label) return { ok: false, message: "Indiquez un libellé." }
  let date = now
  if (body.date !== undefined && body.date !== null && body.date !== "") {
    date = new Date(String(body.date))
    if (Number.isNaN(date.getTime())) return { ok: false, message: "Date invalide." }
  }
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null
  return { ok: true, values: { direction, category, amount, label, note, date } }
}

// Totaux d'un mois et solde avant / après (solde = Σ entrées − Σ sorties).
export const summarizeMonth = (entries: EntryLike[], month: string) => {
  let balanceBefore = 0
  let income = 0
  let expenses = 0
  let sales = 0
  for (const e of entries) {
    const m = monthOf(e.date)
    if (m < month) {
      balanceBefore += signed(e)
    } else if (m === month) {
      if (e.direction === "in") income += e.amount
      else expenses += e.amount
      if (e.category === "sale") sales += e.amount
      if (e.category === "refund") sales -= e.amount
    }
  }
  return { income, expenses, revenue: sales, balanceBefore, balanceAfter: balanceBefore + income - expenses }
}

// Périodes de la page Caisse (2026-10-12) : jour, semaine (lundi -> dimanche),
// mois ou année contenant la date de référence (AAAA-MM-JJ), heure de
// Ouagadougou (UTC toute l'année). Intervalle [start, end[.
export type Period = "day" | "week" | "month" | "year"
export const PERIODS: Period[] = ["day", "week", "month", "year"]

export const periodRange = (period: Period, anchor: string): { start: Date; end: Date } => {
  const d = new Date(`${anchor}T00:00:00Z`)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  if (period === "year") return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y + 1, 0, 1)) }
  if (period === "month") return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) }
  if (period === "week") {
    const fromMonday = (d.getUTCDay() + 6) % 7
    const start = new Date(Date.UTC(y, m, d.getUTCDate() - fromMonday))
    return { start, end: new Date(start.getTime() + 7 * 86_400_000) }
  }
  return { start: d, end: new Date(d.getTime() + 86_400_000) }
}

// Date de référence de la période précédente (-1) ou suivante (+1).
export const shiftAnchor = (period: Period, anchor: string, delta: number): string => {
  const d = new Date(`${anchor}T00:00:00Z`)
  if (period === "year") d.setUTCFullYear(d.getUTCFullYear() + delta, 0, 1)
  else if (period === "month") d.setUTCMonth(d.getUTCMonth() + delta, 1)
  else d.setUTCDate(d.getUTCDate() + delta * (period === "week" ? 7 : 1))
  return d.toISOString().slice(0, 10)
}

// Totaux d'une période et solde avant / après (même calcul que summarizeMonth).
export const summarizeRange = (entries: EntryLike[], range: { start: Date; end: Date }) => {
  let balanceBefore = 0
  let income = 0
  let expenses = 0
  let sales = 0
  for (const e of entries) {
    const t = time(e)
    if (t < range.start.getTime()) {
      balanceBefore += signed(e)
    } else if (t < range.end.getTime()) {
      if (e.direction === "in") income += e.amount
      else expenses += e.amount
      if (e.category === "sale") sales += e.amount
      if (e.category === "refund") sales -= e.amount
    }
  }
  return { income, expenses, revenue: sales, balanceBefore, balanceAfter: balanceBefore + income - expenses }
}

// Écritures triées dans l'ordre chronologique, avec le solde après chacune.
export const withRunningBalance = <T extends EntryLike>(entries: T[], balanceBefore: number): (T & { balance_after: number })[] => {
  let balance = balanceBefore
  return [...entries]
    .sort((a, b) => time(a) - time(b))
    .map((e) => {
      balance += signed(e)
      return { ...e, balance_after: balance }
    })
}

// Lignes du tableau de la caisse (2026-10-12, demandé par le propriétaire) :
// une ligne par commande, avec son encaissement (Entrée) et ses frais
// (Sortie) sur la même ligne ; une ligne par écriture sans commande (achats,
// publicité, divers). Ordre chronologique (dernière écriture de la ligne),
// avec le solde après chaque ligne.
export type CashRow<T> = {
  id: string
  date: Date | string
  order_id: string | null
  order_number: string | null
  income: number
  expense: number
  entries: T[]
  balance_after: number
}

const orderNumberIn = (label: string) => /commande (\S+)/.exec(label)?.[1] ?? null

export const rowsByOrder = <T extends EntryLike & { order_id?: string | null; label: string }>(
  entries: T[],
  balanceBefore: number
): CashRow<T>[] => {
  const groups = new Map<string, T[]>()
  for (const e of [...entries].sort((a, b) => time(a) - time(b))) {
    const key = e.order_id ? `order:${e.order_id}` : `entry:${e.id}`
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  let balance = balanceBefore
  return [...groups.entries()]
    .map(([key, list]) => ({ key, list, last: list[list.length - 1] }))
    .sort((a, b) => time(a.last) - time(b.last))
    .map(({ key, list, last }) => {
      const income = list.filter((e) => e.direction === "in").reduce((sum, e) => sum + e.amount, 0)
      const expense = list.filter((e) => e.direction === "out").reduce((sum, e) => sum + e.amount, 0)
      balance += income - expense
      const orderId = list[0].order_id ?? null
      return {
        id: key,
        date: last.date,
        order_id: orderId,
        order_number: orderId ? list.map((e) => orderNumberIn(e.label)).find(Boolean) ?? null : null,
        income,
        expense,
        entries: list,
        balance_after: balance,
      }
    })
}

// Ventes nettes (ventes − remboursements), dépenses (autres sorties) et
// résultat des `count` derniers mois, du plus récent au plus ancien.
export const monthlyHistory = (entries: EntryLike[], now: Date, count = 12) => {
  const months: string[] = []
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  for (let i = 0; i < count; i++) {
    months.push(cursor.toISOString().slice(0, 7))
    cursor.setUTCMonth(cursor.getUTCMonth() - 1)
  }
  return months.map((month) => {
    let sales = 0
    let expenses = 0
    for (const e of entries) {
      if (monthOf(e.date) !== month) continue
      if (e.category === "sale") sales += e.amount
      else if (e.category === "refund") sales -= e.amount
      else if (e.direction === "out") expenses += e.amount
    }
    return { month, sales, expenses, result: sales - expenses }
  })
}

type OrderRef = { orderId: string | null; orderNumber: string | null }
const orderLabel = (ref: OrderRef) => (ref.orderNumber ? ` commande ${ref.orderNumber}` : "")

export const saleEntriesFromPayment = (
  payment: { id: string; captures?: { id: string; amount: number | string; created_at: Date | string }[] },
  ref: OrderRef
): NewEntry[] =>
  (payment.captures ?? [])
    .filter((c) => Number(c.amount) > 0)
    .map((c) => ({
      date: new Date(c.created_at),
      direction: "in",
      amount: Math.round(Number(c.amount)),
      category: "sale",
      label: `Vente${orderLabel(ref)}`,
      source: "auto",
      reference: `capture:${c.id}`,
      order_id: ref.orderId,
    }))

export const refundEntriesFromPayment = (
  payment: { id: string; refunds?: { id: string; amount: number | string; created_at: Date | string }[] },
  ref: OrderRef
): NewEntry[] =>
  (payment.refunds ?? [])
    .filter((r) => Number(r.amount) > 0)
    .map((r) => ({
      date: new Date(r.created_at),
      direction: "out",
      amount: Math.round(Number(r.amount)),
      category: "refund",
      label: `Remboursement${orderLabel(ref)}`,
      source: "auto",
      reference: `refund:${r.id}`,
      order_id: ref.orderId,
    }))

// Frais d'une livraison terminée : sortie de caisse (le livreur les prélève sur
// l'argent encaissé, ou les avance pour une expédition).
export const feeEntriesFromDelivery = (
  delivery: {
    id: string
    order_id: string
    completed_at: Date | string | null
    courier_fee: number | null
    transport_fee: number | null
    transport_company: string | null
  },
  courierName: string | null,
  orderNumber: string | null
): NewEntry[] => {
  const date = new Date(delivery.completed_at ?? Date.now())
  const suffix = orderNumber ? ` - commande ${orderNumber}` : ""
  const entries: NewEntry[] = []
  if (delivery.courier_fee && delivery.courier_fee > 0) {
    entries.push({
      date,
      direction: "out",
      amount: delivery.courier_fee,
      category: "courier_fee",
      label: `Frais livreur${courierName ? ` ${courierName}` : ""}${suffix}`,
      source: "auto",
      reference: `delivery:${delivery.id}:courier_fee`,
      order_id: delivery.order_id,
    })
  }
  if (delivery.transport_fee && delivery.transport_fee > 0) {
    entries.push({
      date,
      direction: "out",
      amount: delivery.transport_fee,
      category: "transport_fee",
      label: `Frais ${delivery.transport_company || "compagnie de transport"}${suffix}`,
      source: "auto",
      reference: `delivery:${delivery.id}:transport_fee`,
      order_id: delivery.order_id,
    })
  }
  return entries
}

// Formulaire "Marquer comme payée" de la fiche commande (2026-10-11) : montant
// encaissé (entrée "Vente") et frais engagés par le livreur, en deux champs
// (sorties) : sa course et ce qu'il a payé à la compagnie de transport. Seules
// ces valeurs comptent pour la caisse de la commande ; leurs références les
// distinguent des écritures automatiques et bloquent celles qui arriveraient
// après.
export const FINAL_REFERENCE_PREFIX = "order-final:"

export const finalReferences = (orderId: string) => ({
  sale: `${FINAL_REFERENCE_PREFIX}${orderId}:sale`,
  courierFee: `${FINAL_REFERENCE_PREFIX}${orderId}:courier_fee`,
  transportFee: `${FINAL_REFERENCE_PREFIX}${orderId}:transport_fee`,
})

export type PaymentFormValues = { amount: number; courier_fee: number; transport_fee: number }

const optionalFee = (value: unknown): number | null => {
  const fee = value === undefined || value === null || value === "" ? 0 : Number(value)
  return Number.isInteger(fee) && fee >= 0 ? fee : null
}

export const parsePaymentForm = (body: {
  amount?: unknown
  courier_fee?: unknown
  transport_fee?: unknown
}): ({ ok: true } & PaymentFormValues) | { ok: false; message: string } => {
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount)
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: "Montant encaissé invalide : nombre entier positif en F CFA." }
  }
  const courierFee = optionalFee(body.courier_fee)
  if (courierFee === null) return { ok: false, message: "Course du livreur invalide : nombre entier en F CFA (0 si aucune)." }
  const transportFee = optionalFee(body.transport_fee)
  if (transportFee === null) {
    return { ok: false, message: "Frais de la compagnie invalides : nombre entier en F CFA (0 si aucun)." }
  }
  return { ok: true, amount, courier_fee: courierFee, transport_fee: transportFee }
}

export const finalPaymentEntries = (
  input: PaymentFormValues & { orderId: string; orderNumber: string | null; date: Date }
): NewEntry[] => {
  const refs = finalReferences(input.orderId)
  const suffix = input.orderNumber ? ` - commande ${input.orderNumber}` : ""
  const entry = (direction: Direction, amount: number, category: Category, label: string, reference: string): NewEntry => ({
    date: input.date,
    direction,
    amount,
    category,
    label,
    source: "auto",
    reference,
    order_id: input.orderId,
  })
  const entries = [entry("in", input.amount, "sale", `Vente${input.orderNumber ? ` commande ${input.orderNumber}` : ""}`, refs.sale)]
  if (input.courier_fee > 0) entries.push(entry("out", input.courier_fee, "courier_fee", `Course du livreur${suffix}`, refs.courierFee))
  if (input.transport_fee > 0) {
    entries.push(entry("out", input.transport_fee, "transport_fee", `Frais compagnie de transport${suffix}`, refs.transportFee))
  }
  return entries
}

// Pré-remplissage du formulaire : frais déjà saisis sur la livraison. À
// défaut : course au tarif unique (1 000 F, fixé par le propriétaire le
// 2026-10-11) et, pour une expédition, les frais d'expédition payés par le
// client, que le livreur reverse à la compagnie de transport (0 et champ
// masqué pour une livraison Ouaga).
export const DEFAULT_COURIER_FEE_XOF = 1000

export const expectedFees = (input: {
  type: "express" | "expedition"
  courierFee: number | null
  transportFee: number | null
  productShippingFee: number
}): { courier_fee: number; transport_fee: number } => ({
  courier_fee: input.courierFee ?? DEFAULT_COURIER_FEE_XOF,
  transport_fee: input.transportFee ?? (input.type === "expedition" ? input.productShippingFee : 0),
})
