import { MedusaError } from "@medusajs/framework/utils"

// Règles du stock confié aux livreurs (spec 2026-09-28 stock-livreurs) :
// solde = somme des mouvements ; le stock Medusa reste le stock total
// possédé, seule une correction (perte / trouvaille) l'ajuste.

export type StockMovementType = "handover" | "return" | "delivery" | "adjustment"
export type MovementLike = { courier_id: string; inventory_item_id: string; quantity: number }
type Line = { inventory_item_id: string; quantity: number }

// Garde-fou contre les fautes de frappe (3000 au lieu de 3).
const MAX_QUANTITY = 10000

const refuse = (message: string) => new MedusaError(MedusaError.Types.NOT_ALLOWED, message)

export const balances = (movements: MovementLike[]) => {
  const result: Record<string, Record<string, number>> = {}
  for (const m of movements) {
    const courier = (result[m.courier_id] ??= {})
    courier[m.inventory_item_id] = (courier[m.inventory_item_id] ?? 0) + m.quantity
  }
  for (const [courierId, items] of Object.entries(result)) {
    for (const [itemId, qty] of Object.entries(items)) if (qty === 0) delete items[itemId]
    if (!Object.keys(items).length) delete result[courierId]
  }
  return result
}

export const courierTotals = (b: Record<string, Record<string, number>>) => {
  const totals: Record<string, number> = {}
  for (const items of Object.values(b)) {
    for (const [itemId, qty] of Object.entries(items)) totals[itemId] = (totals[itemId] ?? 0) + qty
  }
  return totals
}

// Besoins en articles physiques d'une commande (kits décomposés).
export const orderItemNeeds = (
  items: { variant_id?: string | null; quantity: number }[],
  inventoryByVariant: Record<string, { inventory_item_id: string; required_quantity: number }[]>
) => {
  const needs: Record<string, number> = {}
  for (const item of items) {
    for (const inv of (item.variant_id && inventoryByVariant[item.variant_id]) || []) {
      needs[inv.inventory_item_id] = (needs[inv.inventory_item_id] ?? 0) + Number(item.quantity) * (inv.required_quantity || 1)
    }
  }
  return needs
}

// Le livreur prend dans son stock ce qu'il a ; le reste vient du dépôt.
export const deliveryTakes = (needs: Record<string, number>, balance: Record<string, number>): Line[] =>
  Object.entries(needs)
    .map(([inventory_item_id, need]) => ({ inventory_item_id, quantity: Math.min(need, Math.max(balance[inventory_item_id] ?? 0, 0)) }))
    .filter((l) => l.quantity > 0)

const merge = (lines: Line[]) => {
  const totals = new Map<string, number>()
  for (const l of lines) totals.set(l.inventory_item_id, (totals.get(l.inventory_item_id) ?? 0) + l.quantity)
  return [...totals.entries()].map(([inventory_item_id, quantity]) => ({ inventory_item_id, quantity }))
}

export const parseMovementLines = (
  type: "handover" | "return" | "adjustment",
  lines: Line[],
  ctx: { balance: Record<string, number>; warehouse: Record<string, number> }
) => {
  if (!lines.length) throw refuse("Ajoutez au moins un produit.")
  for (const l of lines) {
    const valid = Number.isInteger(l.quantity) && (type === "adjustment" ? l.quantity >= 0 : l.quantity > 0)
    if (!valid) throw refuse("Quantité invalide : nombre entier positif.")
    if (l.quantity > MAX_QUANTITY) throw refuse("Quantité trop grande (plus de 10 000) : vérifiez la saisie.")
  }
  if (type === "adjustment") {
    const counted = new Map(lines.map((l) => [l.inventory_item_id, l.quantity]))
    const movements = [...counted.entries()]
      .map(([inventory_item_id, qty]) => ({ inventory_item_id, quantity: qty - (ctx.balance[inventory_item_id] ?? 0) }))
      .filter((m) => m.quantity !== 0)
    if (!movements.length) throw refuse("Aucun écart : les quantités comptées correspondent au stock du livreur.")
    return {
      movements,
      stockAdjustments: movements.map((m) => ({ inventory_item_id: m.inventory_item_id, adjustment: m.quantity })),
    }
  }
  const merged = merge(lines)
  for (const l of merged) {
    if (type === "handover" && l.quantity > (ctx.warehouse[l.inventory_item_id] ?? 0)) {
      throw refuse(`Stock insuffisant au dépôt : ${ctx.warehouse[l.inventory_item_id] ?? 0} disponible(s).`)
    }
    if (type === "return" && l.quantity > (ctx.balance[l.inventory_item_id] ?? 0)) {
      throw refuse(`Le livreur n'en a que ${ctx.balance[l.inventory_item_id] ?? 0}.`)
    }
  }
  return {
    movements: merged.map((l) => ({ inventory_item_id: l.inventory_item_id, quantity: type === "return" ? -l.quantity : l.quantity })),
    stockAdjustments: [] as { inventory_item_id: string; adjustment: number }[],
  }
}

const DEFAULT_VARIANT = /^(default|default variant|default title|défaut)$/i

export const itemLabel = (item: {
  title?: string | null
  sku?: string | null
  variants?: { title?: string | null; product?: { title?: string | null } | null }[] | null
}) => {
  const variant = item.variants?.[0]
  const product = variant?.product?.title
  if (product) return variant?.title && !DEFAULT_VARIANT.test(variant.title) ? `${product} - ${variant.title}` : product
  return item.title || item.sku || "Article sans nom"
}
