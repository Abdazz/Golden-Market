import type { NewEntry } from "./cashbook-rules"

// Règles de l'approvisionnement (spec 2026-09-28 approvisionnement-marges) :
// formules de la feuille "Sourcing" du propriétaire, fonctions pures testées.

export type LineInput = {
  quantity: number
  unit_price_usd: number
  freight_usd: number
  transport_xof: number
  ads_usd: number
}
export type RateParams = { exchange_rate: number; fee_rate: number }

// P. T. Achat ($) = (quantité × P. U. A. + fret) × (1 + frais de transaction)
// P. R. total (F) = (P. T. Achat + pub) × taux + transport
// Sortie de caisse = P. T. Achat × taux + transport (la pub est suivie à part
// au journal de caisse, elle n'entre que dans le prix de revient).
export const lineCosts = (line: LineInput, params: RateParams) => {
  const purchaseUsd = (line.quantity * line.unit_price_usd + (line.freight_usd || 0)) * (1 + params.fee_rate)
  const costTotal = (purchaseUsd + (line.ads_usd || 0)) * params.exchange_rate + (line.transport_xof || 0)
  return {
    purchaseUsd,
    costTotal,
    unitCost: line.quantity > 0 ? costTotal / line.quantity : 0,
    cashOut: purchaseUsd * params.exchange_rate + (line.transport_xof || 0),
  }
}

// Marge brute unitaire et % sur le prix de revient (comme la feuille).
export const margin = (unitCost: number | null | undefined, price: number | null | undefined) => {
  if (unitCost === null || unitCost === undefined || price === null || price === undefined || unitCost <= 0) {
    return { unit: null, percent: null }
  }
  const unit = price - unitCost
  return { unit, percent: unit / unitCost }
}

const num = (value: unknown): number => {
  if (value === undefined || value === null || value === "") return 0
  return typeof value === "number" ? value : Number(String(value).replace(",", ".").replace(/\s/g, ""))
}

export const parseLine = (body: {
  variant_id?: unknown
  title?: unknown
  quantity?: unknown
  unit_price_usd?: unknown
  freight_usd?: unknown
  transport_xof?: unknown
  ads_usd?: unknown
}):
  | { ok: true; values: { variant_id: string; title: string; quantity: number } & Omit<LineInput, "quantity"> }
  | { ok: false; message: string } => {
  const variant_id = typeof body.variant_id === "string" ? body.variant_id.trim() : ""
  if (!variant_id) return { ok: false, message: "Choisissez un produit pour chaque ligne." }
  const quantity = num(body.quantity)
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, message: "Quantité invalide : nombre entier positif." }
  const values = {
    unit_price_usd: num(body.unit_price_usd),
    freight_usd: num(body.freight_usd),
    transport_xof: num(body.transport_xof),
    ads_usd: num(body.ads_usd),
  }
  if (Object.values(values).some((v) => Number.isNaN(v) || v < 0)) {
    return { ok: false, message: "Montants invalides : nombres positifs (virgule ou point acceptés)." }
  }
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : variant_id
  return { ok: true, values: { variant_id, title, quantity, ...values } }
}

// Ajustements de stock à la réception : chaque article d'inventaire de la
// variante (plusieurs pour un kit) augmente de quantité × quantité requise.
export const inventoryAdjustments = (
  lines: { variant_id: string; quantity: number }[],
  inventoryByVariant: Record<string, { inventory_item_id: string; required_quantity: number }[]>,
  locationId: string
) => {
  const totals = new Map<string, number>()
  for (const line of lines) {
    const items = inventoryByVariant[line.variant_id]
    if (!items?.length) throw new Error("Variante introuvable ou sans stock suivi : vérifiez le produit de la ligne.")
    for (const item of items) {
      totals.set(item.inventory_item_id, (totals.get(item.inventory_item_id) ?? 0) + line.quantity * (item.required_quantity || 1))
    }
  }
  return [...totals.entries()].map(([inventory_item_id, adjustment]) => ({ inventory_item_id, location_id: locationId, adjustment }))
}

type OrderRef = { id: string; reference: string; ordered_at: Date | string | null } & RateParams

const cashTotal = (order: OrderRef, lines: LineInput[]) =>
  Math.round(lines.reduce((sum, line) => sum + lineCosts(line, order).cashOut, 0))

export const orderCashEntry = (order: OrderRef, lines: LineInput[]): NewEntry => ({
  date: new Date(order.ordered_at ?? Date.now()),
  direction: "out",
  amount: cashTotal(order, lines),
  category: "purchase",
  label: `Commande fournisseur ${order.reference}`,
  source: "auto",
  reference: `supplier_order:${order.id}`,
  order_id: null,
})

export const cancelCashEntry = (order: OrderRef, lines: LineInput[], now: Date = new Date()): NewEntry => ({
  date: now,
  direction: "in",
  amount: cashTotal(order, lines),
  category: "other_in",
  label: `Annulation commande fournisseur ${order.reference}`,
  source: "auto",
  reference: `supplier_order:${order.id}:cancel`,
  order_id: null,
})
