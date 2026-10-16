import { paymentEditStatus } from "./payment-edit-rules"

// « Marquer non payée » / « Marquer non livrée » (2026-10-16, demandé par le
// propriétaire) : possibles 24 h après la dernière action « payée » / « livrée »
// (limite incluse, même règle que paymentEditStatus). Fonctions pures, testées.

export type UndoFacts = {
  canceled: boolean
  // Au moins une capture de paiement (formulaire, bouton natif, fin de livraison).
  paid: boolean
  refunded: boolean
  // Date de l'écriture finale order-final:<id>:sale (« Marquer payée » / « Modifier le paiement »).
  finalSaleAt: string | null
  captureDates: string[]
  deliveries: { status: string; completed_at: string | null }[]
  fulfillments: { shipped_at: string | null; delivered_at: string | null; canceled_at: string | null }[]
}

export type UndoWindow = { available: boolean; until: string | null }

const latest = (dates: (string | null | undefined)[]): Date | null => {
  const times = dates.filter((d): d is string => !!d).map((d) => new Date(d).getTime())
  return times.length ? new Date(Math.max(...times)) : null
}

// Paiement : la plus récente de la vente finale et des captures.
export const paidActionAt = (f: UndoFacts): Date | null => latest([f.finalSaleAt, ...f.captureDates])

const doneDeliveries = (f: UndoFacts) => f.deliveries.filter((d) => d.status === "delivered" || d.status === "shipped")
const liveFulfillments = (f: UndoFacts) => f.fulfillments.filter((x) => !x.canceled_at && (x.shipped_at || x.delivered_at))

// Livraison : fin de la dernière livraison livrée / expédiée ; sans livraison,
// la date de livraison (sinon d'expédition) de l'expédition Medusa.
export const deliveredActionAt = (f: UndoFacts): Date | null => {
  const done = doneDeliveries(f)
  if (done.length) return latest(done.map((d) => d.completed_at))
  return latest(liveFulfillments(f).map((x) => x.delivered_at ?? x.shipped_at))
}

export const isDelivered = (f: UndoFacts) => doneDeliveries(f).length > 0 || liveFulfillments(f).length > 0

const windowOf = (at: Date | null, now: Date): UndoWindow => {
  const s = paymentEditStatus(at, now)
  return { available: s.editable, until: s.editable_until }
}

export const undoRefusal = (kind: "paid" | "delivered", f: UndoFacts, now: Date = new Date()): string | null => {
  if (f.canceled) return "Commande annulée : rien à défaire."
  if (kind === "paid") {
    if (!f.paid) return "La commande n'est pas payée."
    if (f.refunded) return "Paiement déjà remboursé : annulation impossible."
    if (!windowOf(paidActionAt(f), now).available) return "Délai de 24 h dépassé : le paiement ne peut plus être annulé."
    return null
  }
  if (!isDelivered(f)) return "La commande n'est pas livrée."
  if (!windowOf(deliveredActionAt(f), now).available) return "Délai de 24 h dépassé : la livraison ne peut plus être annulée."
  return null
}

const statusOf = (kind: "paid" | "delivered", f: UndoFacts, now: Date): UndoWindow =>
  undoRefusal(kind, f, now) === null
    ? windowOf(kind === "paid" ? paidActionAt(f) : deliveredActionAt(f), now)
    : { available: false, until: null }

export const undoStatus = (f: UndoFacts, now: Date = new Date()) => ({
  paid: statusOf("paid", f, now),
  delivered: statusOf("delivered", f, now),
})
