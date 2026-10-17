import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

// Les trois prix d'une variante, vus de l'admin (widget « Prix » de la fiche
// produit) : standard (prix sans règle), promotionnel (price list Sale active)
// et de gros (prix réservé au groupe « Grossistes »). Devise XOF uniquement.
const CURRENCY = "xof"
const WHOLESALE_GROUP = "Grossistes"
const GROUP_RULE = "customer.groups.id"

export type PriceCell = { id: string; amount: number }
export type VariantPrices = {
  variant_id: string
  title: string | null
  standard: PriceCell | null
  promo: (PriceCell & { price_list_id: string }) | null
  wholesale: PriceCell | null
}
export type PriceInput = { standard: number; promo: number | null; wholesale: number | null }

const isAmount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0

// Montants entiers en F CFA ; vide = pas de prix (sauf le standard, obligatoire).
export function parsePriceInput(body: any): PriceInput | string {
  const opt = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v))
  const standard = Number(body?.standard)
  const promo = opt(body?.promo)
  const wholesale = opt(body?.wholesale)
  if (!isAmount(standard)) return "Le prix standard doit être un montant entier en F CFA."
  if (promo !== null && !isAmount(promo)) return "Le prix promotionnel doit être un montant entier en F CFA (ou vide)."
  if (wholesale !== null && !isAmount(wholesale)) return "Le prix de gros doit être un montant entier en F CFA (ou vide)."
  if (promo !== null && promo >= standard) return "Le prix promotionnel doit être inférieur au prix standard."
  return { standard, promo, wholesale }
}

const cell = (p: any): PriceCell => ({ id: p.id, amount: Number(p.amount) })

async function wholesaleGroupId(container: any): Promise<string | null> {
  const customer = container.resolve(Modules.CUSTOMER)
  const [group] = await customer.listCustomerGroups({ name: WHOLESALE_GROUP }, { take: 1 })
  return group?.id ?? null
}

async function activeSaleLists(container: any) {
  const pricing = container.resolve(Modules.PRICING)
  const lists = await pricing.listPriceLists({ status: ["active"] }, { take: 50 })
  return lists.filter((l: any) => l.type === "sale")
}

async function priceSetOf(container: any, variantId: string): Promise<string | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "variant", fields: ["id", "price_set.id"], filters: { id: variantId } })
  return data[0]?.price_set?.id ?? null
}

export async function loadProductPrices(container: any, productId: string): Promise<VariantPrices[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricing = container.resolve(Modules.PRICING)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "variants.id", "variants.title", "variants.price_set.id"],
    filters: { id: productId },
  })
  const groupId = await wholesaleGroupId(container)
  const saleIds = new Set((await activeSaleLists(container)).map((l: any) => l.id))
  const out: VariantPrices[] = []
  for (const v of products[0]?.variants ?? []) {
    const row: VariantPrices = { variant_id: v.id, title: v.title ?? null, standard: null, promo: null, wholesale: null }
    if (v.price_set?.id) {
      const prices = await pricing.listPrices(
        { price_set_id: [v.price_set.id], currency_code: [CURRENCY] },
        { relations: ["price_rules"], take: 100 }
      )
      for (const p of prices) {
        const rules = p.price_rules ?? []
        if (p.price_list_id) {
          if (saleIds.has(p.price_list_id) && !rules.length) row.promo ??= { ...cell(p), price_list_id: p.price_list_id }
        } else if (!rules.length) row.standard = cell(p)
        else if (groupId && rules.length === 1 && rules[0].attribute === GROUP_RULE && rules[0].value === groupId) row.wholesale = cell(p)
      }
    }
    out.push(row)
  }
  return out
}

// Enregistre les trois prix d'une variante : crée, met à jour ou retire chaque
// ligne. Les autres prix (autres devises, régions) ne sont jamais touchés.
export async function saveVariantPrices(container: any, variantId: string, input: PriceInput): Promise<string | null> {
  const pricing = container.resolve(Modules.PRICING)
  const priceSetId = await priceSetOf(container, variantId)
  if (!priceSetId) return "Variante introuvable."
  const [current] = await loadProductPriceSet(container, variantId)
  const groupId = await wholesaleGroupId(container)
  if (input.wholesale !== null && !groupId) return "Le groupe de clients « Grossistes » n'existe pas."
  let saleList: any = null
  if (input.promo !== null && !current.promo) {
    const lists = await activeSaleLists(container)
    if (lists.length !== 1) return "Impossible d'ajouter une promotion : il faut exactement une liste de prix Sale active."
    saleList = lists[0]
  }

  if (current.standard) await pricing.updatePrices([{ id: current.standard.id, amount: input.standard }])
  else await pricing.addPrices({ priceSetId, prices: [{ amount: input.standard, currency_code: CURRENCY }] })

  if (input.wholesale === null) {
    if (current.wholesale) await pricing.removePrices([current.wholesale.id])
  } else if (current.wholesale) await pricing.updatePrices([{ id: current.wholesale.id, amount: input.wholesale }])
  else await pricing.addPrices({ priceSetId, prices: [{ amount: input.wholesale, currency_code: CURRENCY, rules: { [GROUP_RULE]: groupId } }] })

  if (input.promo === null) {
    if (current.promo) await pricing.removePrices([current.promo.id])
  } else if (current.promo) {
    await pricing.updatePriceListPrices([
      { price_list_id: current.promo.price_list_id, prices: [{ id: current.promo.id, price_set_id: priceSetId, amount: input.promo, currency_code: CURRENCY }] },
    ])
  } else {
    await pricing.addPriceListPrices([
      { price_list_id: saleList.id, prices: [{ price_set_id: priceSetId, amount: input.promo, currency_code: CURRENCY }] },
    ])
  }
  return null
}

async function loadProductPriceSet(container: any, variantId: string): Promise<VariantPrices[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "variant", fields: ["product_id"], filters: { id: variantId } })
  const all = await loadProductPrices(container, data[0].product_id)
  return all.filter((v) => v.variant_id === variantId)
}
