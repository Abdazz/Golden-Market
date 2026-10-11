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
// encaissé (entrée "Vente") et frais engagés par le livreur, course et
// compagnie de transport confondues (sortie). Seules ces valeurs comptent pour
// la caisse de la commande ; leurs références les distinguent des écritures
// automatiques et bloquent celles qui arriveraient après.
export const FINAL_REFERENCE_PREFIX = "order-final:"

export const finalReferences = (orderId: string) => ({
  sale: `${FINAL_REFERENCE_PREFIX}${orderId}:sale`,
  fees: `${FINAL_REFERENCE_PREFIX}${orderId}:fees`,
})

export const parsePaymentForm = (body: {
  amount?: unknown
  fees?: unknown
}): { ok: true; amount: number; fees: number } | { ok: false; message: string } => {
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount)
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: "Montant encaissé invalide : nombre entier positif en F CFA." }
  }
  const fees = body.fees === undefined || body.fees === null || body.fees === "" ? 0 : Number(body.fees)
  if (!Number.isInteger(fees) || fees < 0) {
    return { ok: false, message: "Frais invalides : nombre entier en F CFA (0 si aucun)." }
  }
  return { ok: true, amount, fees }
}

export const finalPaymentEntries = (input: {
  orderId: string
  orderNumber: string | null
  amount: number
  fees: number
  date: Date
}): NewEntry[] => {
  const refs = finalReferences(input.orderId)
  const suffix = input.orderNumber ? ` commande ${input.orderNumber}` : ""
  const entries: NewEntry[] = [
    {
      date: input.date,
      direction: "in",
      amount: input.amount,
      category: "sale",
      label: `Vente${suffix}`,
      source: "auto",
      reference: refs.sale,
      order_id: input.orderId,
    },
  ]
  if (input.fees > 0) {
    entries.push({
      date: input.date,
      direction: "out",
      amount: input.fees,
      category: "courier_fee",
      label: `Frais livreur et expédition${input.orderNumber ? ` - commande ${input.orderNumber}` : ""}`,
      source: "auto",
      reference: refs.fees,
      order_id: input.orderId,
    })
  }
  return entries
}

// Pré-remplissage du formulaire : frais déjà saisis sur la livraison (course
// du livreur, compagnie de transport) ; à défaut, pour une expédition, les
// frais d'expédition des produits de la commande.
export const expectedFees = (input: {
  type: "express" | "expedition"
  courierFee: number | null
  transportFee: number | null
  productShippingFee: number
}): number => {
  const transport = input.transportFee ?? (input.type === "expedition" ? input.productShippingFee : 0)
  return (input.courierFee ?? 0) + transport
}
