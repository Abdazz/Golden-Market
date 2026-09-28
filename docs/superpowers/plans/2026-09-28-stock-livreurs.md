# Stock confié aux livreurs — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Savoir à tout moment combien il reste de chaque produit chez chaque livreur (remises, retours, corrections, déstockage automatique à la livraison).

**Architecture:** Nouveau modèle `courier_stock_movement` dans le module `delivery` (solde = somme des mouvements). Le stock Medusa reste le stock total possédé ; seule la correction l'ajuste (perte/trouvaille). Règles pures dans `src/lib/courier-stock-rules.ts`, écritures par workflows, onglet « Stock livreurs » dans la page Livraisons.

**Tech Stack:** Medusa v2.18 (DML, MedusaService, workflows SDK, `adjustInventoryLevelsStep`), Zod (`@medusajs/framework/zod`), React admin (HTML natif + classes utilitaires, pas de `@medusajs/ui`), Jest (`npm run test:unit`).

**Spec:** `docs/superpowers/specs/2026-09-28-stock-livreurs-design.md`

## Global Constraints

- Stock Medusa = stock total possédé : remise et retour ne touchent PAS au stock Medusa ; la correction l'ajuste de l'écart (compté − solde).
- Déstockage à la livraison (`delivered` ou `shipped`) : `min(besoin, solde)` par article physique, jamais de solde négatif ; échec de livraison = aucun mouvement.
- Une livraison ne déstocke qu'une fois : index unique partiel (`delivery_id`, `inventory_item_id`).
- Déstockage non bloquant : une erreur est journalisée, la livraison reste terminée.
- Correction : note obligatoire.
- Emplacement de stock unique (premier `stock_location`).
- Code, commentaires, UI et commits en français ; pas d'emoji dans le code ; pas de trailer Co-Authored-By.
- Admin : HTML natif + classes utilitaires Medusa, `api()` de `src/admin/lib/deliveries.ts`, utilisable sur téléphone.
- Toutes les commandes backend se lancent depuis `apps/backend`.

## Review Focus

1. Double clic sur « Livrée » (deux requêtes simultanées) : un seul déstockage — l'index unique fait échouer la seconde insertion, l'erreur est journalisée sans casser la réponse (test Task 3 : `prepareDeliveryTakes` renvoie `[]` si des mouvements existent déjà pour la livraison).
2. Commande contenant un kit et un article simple partageant le même article physique (ex. kit « Balai + seau » + seau seul) : les besoins s'additionnent par article physique (test Task 1 `orderItemNeeds`).
3. Même produit saisi deux fois dans une remise : les lignes sont fusionnées avant contrôle du stock au dépôt (test Task 1 `parseMovementLines`).
4. Correction à la quantité déjà enregistrée (écart 0 partout) : refusée avec un message clair, aucun mouvement (test Task 1).
5. Article de commande sans variante ou variante sans stock suivi (`manage_inventory` false) : ignoré, pas d'erreur (test Task 1 `orderItemNeeds`).

---

### Task 1: Règles pures du stock livreur

**Files:**
- Create: `apps/backend/src/lib/courier-stock-rules.ts`
- Test: `apps/backend/src/lib/__tests__/courier-stock-rules.unit.spec.ts`

**Interfaces:**
- Produces:
  - `type StockMovementType = "handover" | "return" | "delivery" | "adjustment"`
  - `type MovementLike = { courier_id: string; inventory_item_id: string; quantity: number }`
  - `balances(movements: MovementLike[]): Record<string, Record<string, number>>` — `[courier_id][inventory_item_id]`, soldes nuls omis
  - `courierTotals(b: Record<string, Record<string, number>>): Record<string, number>` — total par article
  - `orderItemNeeds(items: { variant_id?: string | null; quantity: number }[], inventoryByVariant: Record<string, { inventory_item_id: string; required_quantity: number }[]>): Record<string, number>`
  - `deliveryTakes(needs: Record<string, number>, balance: Record<string, number>): { inventory_item_id: string; quantity: number }[]` — quantités positives prises
  - `parseMovementLines(type: "handover" | "return" | "adjustment", lines: { inventory_item_id: string; quantity: number }[], ctx: { balance: Record<string, number>; warehouse: Record<string, number> }): { movements: { inventory_item_id: string; quantity: number }[]; stockAdjustments: { inventory_item_id: string; adjustment: number }[] }` — lève `MedusaError` NOT_ALLOWED
  - `itemLabel(item: { title?: string | null; sku?: string | null; variants?: { title?: string | null; product?: { title?: string | null } | null }[] | null }): string`

- [ ] **Step 1: Write the failing test**

```ts
import { balances, courierTotals, deliveryTakes, itemLabel, orderItemNeeds, parseMovementLines } from "../courier-stock-rules"

describe("balances / courierTotals", () => {
  it("somme les mouvements par livreur et article, omet les soldes nuls", () => {
    const b = balances([
      { courier_id: "c1", inventory_item_id: "balai", quantity: 5 },
      { courier_id: "c1", inventory_item_id: "balai", quantity: -2 },
      { courier_id: "c1", inventory_item_id: "seau", quantity: 3 },
      { courier_id: "c1", inventory_item_id: "seau", quantity: -3 },
      { courier_id: "c2", inventory_item_id: "balai", quantity: 1 },
    ])
    expect(b).toEqual({ c1: { balai: 3 }, c2: { balai: 1 } })
    expect(courierTotals(b)).toEqual({ balai: 4 })
  })
})

describe("orderItemNeeds", () => {
  const inv = {
    kit: [
      { inventory_item_id: "balai", required_quantity: 1 },
      { inventory_item_id: "seau", required_quantity: 1 },
    ],
    seau: [{ inventory_item_id: "seau", required_quantity: 1 }],
    lot2: [{ inventory_item_id: "eponge", required_quantity: 2 }],
  }
  it("décompose les kits et additionne par article physique", () => {
    expect(
      orderItemNeeds(
        [
          { variant_id: "kit", quantity: 1 },
          { variant_id: "seau", quantity: 2 },
          { variant_id: "lot2", quantity: 3 },
        ],
        inv
      )
    ).toEqual({ balai: 1, seau: 3, eponge: 6 })
  })
  it("ignore les articles sans variante ou sans stock suivi", () => {
    expect(orderItemNeeds([{ variant_id: null, quantity: 1 }, { variant_id: "inconnu", quantity: 1 }], inv)).toEqual({})
  })
})

describe("deliveryTakes", () => {
  it("prend min(besoin, solde), rien si solde nul", () => {
    expect(deliveryTakes({ balai: 2, seau: 1, eponge: 4 }, { balai: 1, seau: 5 })).toEqual([
      { inventory_item_id: "balai", quantity: 1 },
      { inventory_item_id: "seau", quantity: 1 },
    ])
  })
})

describe("parseMovementLines", () => {
  const ctx = { balance: { balai: 3 }, warehouse: { balai: 4, seau: 0 } }
  it("remise : fusionne les doublons, quantité positive", () => {
    expect(
      parseMovementLines("handover", [
        { inventory_item_id: "balai", quantity: 2 },
        { inventory_item_id: "balai", quantity: 2 },
      ], ctx)
    ).toEqual({ movements: [{ inventory_item_id: "balai", quantity: 4 }], stockAdjustments: [] })
  })
  it("remise : refuse plus que le stock au dépôt", () => {
    expect(() => parseMovementLines("handover", [{ inventory_item_id: "balai", quantity: 5 }], ctx)).toThrow(/dépôt/)
    expect(() => parseMovementLines("handover", [{ inventory_item_id: "seau", quantity: 1 }], ctx)).toThrow(/dépôt/)
  })
  it("retour : négatif, au plus le solde du livreur", () => {
    expect(parseMovementLines("return", [{ inventory_item_id: "balai", quantity: 3 }], ctx)).toEqual({
      movements: [{ inventory_item_id: "balai", quantity: -3 }],
      stockAdjustments: [],
    })
    expect(() => parseMovementLines("return", [{ inventory_item_id: "balai", quantity: 4 }], ctx)).toThrow(/livreur/)
  })
  it("correction : écart compté - solde, répercuté sur le stock Medusa", () => {
    expect(parseMovementLines("adjustment", [
      { inventory_item_id: "balai", quantity: 1 },
      { inventory_item_id: "seau", quantity: 2 },
    ], ctx)).toEqual({
      movements: [
        { inventory_item_id: "balai", quantity: -2 },
        { inventory_item_id: "seau", quantity: 2 },
      ],
      stockAdjustments: [
        { inventory_item_id: "balai", adjustment: -2 },
        { inventory_item_id: "seau", adjustment: 2 },
      ],
    })
  })
  it("correction sans écart : refusée", () => {
    expect(() => parseMovementLines("adjustment", [{ inventory_item_id: "balai", quantity: 3 }], ctx)).toThrow(/Aucun écart/)
  })
  it("refuse les quantités non entières, nulles (remise/retour) ou une liste vide", () => {
    expect(() => parseMovementLines("handover", [{ inventory_item_id: "balai", quantity: 1.5 }], ctx)).toThrow(/entier/)
    expect(() => parseMovementLines("handover", [{ inventory_item_id: "balai", quantity: 0 }], ctx)).toThrow(/entier/)
    expect(() => parseMovementLines("adjustment", [{ inventory_item_id: "balai", quantity: -1 }], ctx)).toThrow(/entier/)
    expect(() => parseMovementLines("handover", [], ctx)).toThrow(/au moins un produit/)
  })
})

describe("itemLabel", () => {
  it("produit + variante, sans variante par défaut, repli titre/sku", () => {
    expect(itemLabel({ variants: [{ title: "Simple", product: { title: "Balai" } }] })).toBe("Balai - Simple")
    expect(itemLabel({ variants: [{ title: "Default variant", product: { title: "Seau" } }] })).toBe("Seau")
    expect(itemLabel({ title: "Éponge", variants: [] })).toBe("Éponge")
    expect(itemLabel({ sku: "SKU-1" })).toBe("SKU-1")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/__tests__/courier-stock-rules.unit.spec.ts`
Expected: FAIL, `Cannot find module '../courier-stock-rules'`

- [ ] **Step 3: Write minimal implementation**

```ts
import { MedusaError } from "@medusajs/framework/utils"

// Règles du stock confié aux livreurs (spec 2026-09-28 stock-livreurs) :
// solde = somme des mouvements ; le stock Medusa reste le stock total
// possédé, seule une correction (perte / trouvaille) l'ajuste.

export type StockMovementType = "handover" | "return" | "delivery" | "adjustment"
export type MovementLike = { courier_id: string; inventory_item_id: string; quantity: number }
type Line = { inventory_item_id: string; quantity: number }

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

const DEFAULT_VARIANT = /^(default|default variant|défaut)$/i

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/__tests__/courier-stock-rules.unit.spec.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/courier-stock-rules.ts src/lib/__tests__/courier-stock-rules.unit.spec.ts
git commit -m "feat(stock-livreurs): règles de calcul (soldes, kits, déstockage, remises/retours/corrections)"
```

### Task 2: Modèle `courier_stock_movement` et migration

**Files:**
- Create: `apps/backend/src/modules/delivery/models/courier-stock-movement.ts`
- Modify: `apps/backend/src/modules/delivery/service.ts`
- Create (généré): `apps/backend/src/modules/delivery/migrations/Migration<horodatage>.ts`

**Interfaces:**
- Produces: service methods `createCourierStockMovements`, `listCourierStockMovements`, `deleteCourierStockMovements` (générés par `MedusaService`).

- [ ] **Step 1: Create the model**

```ts
import { model } from "@medusajs/framework/utils"

// Mouvement du stock confié à un livreur (spec 2026-09-28 stock-livreurs) :
// solde = somme des quantités (signées). Une livraison ne déstocke qu'une
// fois un article (index unique partiel).
export const CourierStockMovement = model
  .define("courier_stock_movement", {
    id: model.id({ prefix: "cstk" }).primaryKey(),
    courier_id: model.text(),
    inventory_item_id: model.text(),
    quantity: model.number(),
    type: model.enum(["handover", "return", "delivery", "adjustment"]),
    delivery_id: model.text().nullable(),
    order_id: model.text().nullable(),
    note: model.text().nullable(),
  })
  .indexes([
    { on: ["courier_id"] },
    { on: ["delivery_id", "inventory_item_id"], unique: true, where: "delivery_id IS NOT NULL AND deleted_at IS NULL" },
  ])
```

- [ ] **Step 2: Register it in the service**

```ts
import { MedusaService } from "@medusajs/framework/utils"
import { Courier } from "./models/courier"
import { CourierSettlement } from "./models/courier-settlement"
import { CourierStockMovement } from "./models/courier-stock-movement"
import { Delivery } from "./models/delivery"

export default class DeliveryModuleService extends MedusaService({
  Courier,
  Delivery,
  CourierSettlement,
  CourierStockMovement,
}) {}
```

- [ ] **Step 3: Generate and apply the migration (local Postgres 5433)**

Run: `npx medusa db:generate delivery && npx medusa db:migrate`
Expected: new migration file creating `courier_stock_movement` with the partial unique index; migrate reports success. Inspect the file: it must only create the new table/indexes.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/modules/delivery
git commit -m "feat(stock-livreurs): modèle courier_stock_movement et migration"
```

### Task 3: Workflows (mouvements manuels, déstockage à la livraison)

**Files:**
- Create: `apps/backend/src/workflows/steps/courier-stock-steps.ts`
- Create: `apps/backend/src/workflows/courier-stock.ts`
- Create: `apps/backend/src/lib/courier-stock-query.ts`
- Test: `apps/backend/src/lib/__tests__/courier-stock-query.unit.spec.ts`

**Interfaces:**
- Consumes: Task 1 rules, Task 2 service methods.
- Produces:
  - `loadCourierBalance(query, courierId: string): Promise<Record<string, number>>`
  - `loadStockItems(query): Promise<{ locationId: string | null; items: { id: string; label: string; stocked: number }[] }>` — `stocked` = `stocked_quantity` du premier emplacement
  - `prepareDeliveryTakes(input: { existingCount: number; needs: Record<string, number>; balance: Record<string, number> }): { inventory_item_id: string; quantity: number }[]` — `[]` si `existingCount > 0`
  - `recordCourierStockWorkflow` input `{ courier_id: string; type: "handover" | "return" | "adjustment"; lines: { inventory_item_id: string; quantity: number }[]; note: string | null }` → movements créés
  - `takeDeliveryStockWorkflow` input `{ delivery_id: string }` → movements créés (`[]` si rien pris)

- [ ] **Step 1: Write the failing test (pure part of the query helper)**

```ts
import { prepareDeliveryTakes } from "../courier-stock-query"

describe("prepareDeliveryTakes", () => {
  it("rien si la livraison a déjà déstocké (double clic)", () => {
    expect(prepareDeliveryTakes({ existingCount: 1, needs: { balai: 1 }, balance: { balai: 3 } })).toEqual([])
  })
  it("sinon min(besoin, solde)", () => {
    expect(prepareDeliveryTakes({ existingCount: 0, needs: { balai: 2 }, balance: { balai: 1 } })).toEqual([
      { inventory_item_id: "balai", quantity: 1 },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/__tests__/courier-stock-query.unit.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the query helper**

```ts
import { balances, deliveryTakes, itemLabel } from "./courier-stock-rules"

// Lectures du stock livreur (spec 2026-09-28 stock-livreurs).

export const loadCourierBalance = async (query: any, courierId: string) => {
  const { data } = await query.graph({
    entity: "courier_stock_movement",
    fields: ["courier_id", "inventory_item_id", "quantity"],
    filters: { courier_id: courierId },
  })
  return balances(data)[courierId] ?? {}
}

export const loadStockItems = async (query: any) => {
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id"] })
  const locationId: string | null = locations[0]?.id ?? null
  const { data } = await query.graph({
    entity: "inventory_item",
    fields: [
      "id",
      "title",
      "sku",
      "location_levels.location_id",
      "location_levels.stocked_quantity",
      "variants.title",
      "variants.product.title",
    ],
  })
  const items = data.map((item: any) => ({
    id: item.id as string,
    label: itemLabel(item),
    stocked: Number((item.location_levels ?? []).find((l: any) => l.location_id === locationId)?.stocked_quantity ?? 0),
  }))
  return { locationId, items }
}

export const prepareDeliveryTakes = (input: {
  existingCount: number
  needs: Record<string, number>
  balance: Record<string, number>
}) => (input.existingCount > 0 ? [] : deliveryTakes(input.needs, input.balance))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/__tests__/courier-stock-query.unit.spec.ts`
Expected: PASS

- [ ] **Step 5: Implement the steps**

```ts
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { balances, courierTotals, orderItemNeeds, parseMovementLines } from "../../lib/courier-stock-rules"
import { loadCourierBalance, loadStockItems, prepareDeliveryTakes } from "../../lib/courier-stock-query"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"

// Étapes du stock confié aux livreurs (spec 2026-09-28 stock-livreurs).

const deliveryService = (container: { resolve: (key: string) => unknown }) =>
  container.resolve(DELIVERY_MODULE) as DeliveryModuleService

export type NewMovement = {
  courier_id: string
  inventory_item_id: string
  quantity: number
  type: "handover" | "return" | "delivery" | "adjustment"
  delivery_id?: string | null
  order_id?: string | null
  note?: string | null
}

export type ManualMovementInput = {
  courier_id: string
  type: "handover" | "return" | "adjustment"
  lines: { inventory_item_id: string; quantity: number }[]
  note: string | null
}

// Contrôles (dépôt, solde du livreur) et calcul des mouvements.
export const prepareManualMovementsStep = createStep(
  "prepare-courier-stock-movements",
  async (input: ManualMovementInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const courier = await deliveryService(container).retrieveCourier(input.courier_id)
    if (input.type === "handover" && !courier.active) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Ce livreur est désactivé.")
    }
    if (input.type === "adjustment" && !input.note?.trim()) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Indiquez la raison de la correction (note).")
    }
    const { data: all } = await query.graph({
      entity: "courier_stock_movement",
      fields: ["courier_id", "inventory_item_id", "quantity"],
    })
    const b = balances(all)
    const totals = courierTotals(b)
    const { locationId, items } = await loadStockItems(query)
    const warehouse = Object.fromEntries(items.map((i: any) => [i.id, i.stocked - (totals[i.id] ?? 0)]))
    const parsed = parseMovementLines(input.type, input.lines, { balance: b[input.courier_id] ?? {}, warehouse })
    if (parsed.stockAdjustments.length && !locationId) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Aucun emplacement de stock configuré.")
    }
    const movements: NewMovement[] = parsed.movements.map((m) => ({
      ...m,
      courier_id: input.courier_id,
      type: input.type,
      note: input.note?.trim() || null,
    }))
    const adjustments = parsed.stockAdjustments.map((a) => ({ ...a, location_id: locationId as string }))
    return new StepResponse({ movements, adjustments })
  }
)

// Déstockage automatique d'une livraison terminée.
export const prepareDeliveryTakesStep = createStep(
  "prepare-delivery-stock-takes",
  async (input: { delivery_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const delivery = await deliveryService(container).retrieveDelivery(input.delivery_id)
    if (delivery.status !== "delivered" && delivery.status !== "shipped") return new StepResponse([] as NewMovement[])
    const { data: existing } = await query.graph({
      entity: "courier_stock_movement",
      fields: ["id"],
      filters: { delivery_id: delivery.id },
    })
    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: ["id", "items.*"],
      filters: { id: delivery.order_id },
    })
    const variantIds = [...new Set((order?.items ?? []).map((i: any) => i.variant_id).filter(Boolean))]
    const { data: variants } = variantIds.length
      ? await query.graph({
          entity: "product_variant",
          fields: ["id", "inventory_items.inventory_item_id", "inventory_items.required_quantity"],
          filters: { id: variantIds },
        })
      : { data: [] }
    const inventoryByVariant = Object.fromEntries(
      variants.map((v: any) => [
        v.id,
        (v.inventory_items ?? []).map((i: any) => ({ inventory_item_id: i.inventory_item_id, required_quantity: Number(i.required_quantity) })),
      ])
    )
    const needs = orderItemNeeds(
      (order?.items ?? []).map((i: any) => ({ variant_id: i.variant_id, quantity: Number(i.quantity) })),
      inventoryByVariant
    )
    const balance = await loadCourierBalance(query, delivery.courier_id)
    const takes = prepareDeliveryTakes({ existingCount: existing.length, needs, balance })
    return new StepResponse(
      takes.map((t) => ({
        courier_id: delivery.courier_id,
        inventory_item_id: t.inventory_item_id,
        quantity: -t.quantity,
        type: "delivery" as const,
        delivery_id: delivery.id,
        order_id: delivery.order_id,
        note: null,
      }))
    )
  }
)

export const createCourierStockMovementsStep = createStep(
  "create-courier-stock-movements",
  async (movements: NewMovement[], { container }) => {
    if (!movements.length) return new StepResponse([], [] as string[])
    const created = await deliveryService(container).createCourierStockMovements(movements)
    return new StepResponse(created, created.map((m: any) => m.id))
  },
  async (ids, { container }) => {
    if (ids?.length) await deliveryService(container).deleteCourierStockMovements(ids)
  }
)
```

- [ ] **Step 6: Implement the workflows**

```ts
import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { adjustInventoryLevelsStep } from "@medusajs/medusa/core-flows"
import {
  createCourierStockMovementsStep,
  prepareDeliveryTakesStep,
  prepareManualMovementsStep,
} from "./steps/courier-stock-steps"
import type { ManualMovementInput } from "./steps/courier-stock-steps"

// Stock confié aux livreurs (spec 2026-09-28 stock-livreurs).

// Remise / retour / correction. Seule la correction ajuste le stock Medusa
// (perte ou trouvaille : le stock total possédé change).
export const recordCourierStockWorkflow = createWorkflow("record-courier-stock", function (input: ManualMovementInput) {
  const prepared = prepareManualMovementsStep(input)
  const movements = transform({ prepared }, ({ prepared }) => prepared.movements)
  const created = createCourierStockMovementsStep(movements)
  when({ prepared }, ({ prepared }) => prepared.adjustments.length > 0).then(() => {
    const adjustments = transform({ prepared }, ({ prepared }) => prepared.adjustments)
    adjustInventoryLevelsStep(adjustments)
  })
  return new WorkflowResponse(created)
})

// Livraison terminée : le livreur déstocke ce qu'il détient.
export const takeDeliveryStockWorkflow = createWorkflow("take-delivery-stock", function (input: { delivery_id: string }) {
  const movements = prepareDeliveryTakesStep(input)
  const created = createCourierStockMovementsStep(movements).config({ name: "create-delivery-stock-movements" })
  return new WorkflowResponse(created)
})
```

- [ ] **Step 7: Typecheck and run all unit tests**

Run: `npx tsc --noEmit -p . && npm run test:unit`
Expected: no type errors, all suites PASS.

- [ ] **Step 8: Commit**

```bash
git add src/workflows/courier-stock.ts src/workflows/steps/courier-stock-steps.ts src/lib/courier-stock-query.ts src/lib/__tests__/courier-stock-query.unit.spec.ts
git commit -m "feat(stock-livreurs): workflows remise/retour/correction et déstockage à la livraison"
```

### Task 4: Routes admin et déstockage à « Livrée »

**Files:**
- Create: `apps/backend/src/api/admin/courier-stock/route.ts`
- Create: `apps/backend/src/api/admin/courier-stock/movements/route.ts`
- Modify: `apps/backend/src/api/admin/deliveries/middlewares.ts` (schéma + matcher)
- Modify: `apps/backend/src/api/admin/deliveries/[id]/complete/route.ts`

**Interfaces:**
- Consumes: Task 3 workflows and `loadStockItems`, `balances`, `courierTotals`, `itemLabel`.
- Produces (HTTP, consommé par Task 5):
  - `GET /admin/courier-stock` → `{ couriers: { id: string; name: string }[]; items: { id: string; label: string; stocked: number; warehouse: number; total_couriers: number; by_courier: Record<string, number> }[] }` (couriers actifs + ceux qui détiennent encore du stock ; items triés : détenus par un livreur d'abord, puis libellé)
  - `GET /admin/courier-stock/movements?courier_id=` → `{ movements: { id: string; created_at: string; type: string; quantity: number; label: string; order_number: string | null; note: string | null }[] }` (200 derniers, plus récents d'abord)
  - `POST /admin/courier-stock/movements` body `{ courier_id, type, lines: [{ inventory_item_id, quantity }], note }` → `{ movements }`
  - `POST /admin/deliveries/:id/complete` réponse enrichie : `stock_taken: { label: string; quantity: number }[]` et `courier_name: string | null`

- [ ] **Step 1: Add the Zod schema and matcher** in `src/api/admin/deliveries/middlewares.ts` (after `ValidateSettlementSchema`):

```ts
export const CourierStockMovementSchema = z.object({
  courier_id: z.string().min(1, "Choisissez un livreur."),
  type: z.enum(["handover", "return", "adjustment"]),
  lines: z
    .array(z.object({ inventory_item_id: z.string().min(1), quantity: z.number().int("Quantité invalide : nombre entier.") }))
    .min(1, "Ajoutez au moins un produit."),
  note: z.string().nullish(),
})
export type CourierStockMovementSchema = z.infer<typeof CourierStockMovementSchema>
```

and in `deliveryMiddlewares`:

```ts
  {
    matcher: "/admin/courier-stock/movements",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(CourierStockMovementSchema)],
  },
```

- [ ] **Step 2: `GET /admin/courier-stock`**

```ts
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { loadStockItems } from "../../../lib/courier-stock-query"
import { balances, courierTotals } from "../../../lib/courier-stock-rules"

// Vue d'ensemble : au dépôt (calculé) / chez chaque livreur / total possédé.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: movements } = await query.graph({
    entity: "courier_stock_movement",
    fields: ["courier_id", "inventory_item_id", "quantity"],
  })
  const b = balances(movements)
  const totals = courierTotals(b)
  const { data: couriers } = await query.graph({ entity: "courier", fields: ["id", "name", "active"] })
  const shown = couriers.filter((c: any) => c.active || b[c.id])
  const { items } = await loadStockItems(query)
  const rows = items
    .map((i) => ({
      id: i.id,
      label: i.label,
      stocked: i.stocked,
      warehouse: i.stocked - (totals[i.id] ?? 0),
      total_couriers: totals[i.id] ?? 0,
      by_courier: Object.fromEntries(shown.map((c: any) => [c.id, b[c.id]?.[i.id] ?? 0])),
    }))
    .sort((x, y) => Number(y.total_couriers > 0) - Number(x.total_couriers > 0) || x.label.localeCompare(y.label, "fr"))
  res.json({ couriers: shown.map((c: any) => ({ id: c.id, name: c.name })), items: rows })
}
```

- [ ] **Step 3: `GET`/`POST /admin/courier-stock/movements`**

```ts
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { itemLabel } from "../../../../lib/courier-stock-rules"
import { orderNumberOf } from "../../../../lib/order-number"
import { recordCourierStockWorkflow } from "../../../../workflows/courier-stock"
import type { CourierStockMovementSchema } from "../../deliveries/middlewares"

// Historique d'un livreur (200 derniers mouvements).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const courierId = req.query.courier_id
  if (typeof courierId !== "string" || !courierId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Paramètre courier_id obligatoire.")
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: movements } = await query.graph({
    entity: "courier_stock_movement",
    fields: ["id", "created_at", "type", "quantity", "inventory_item_id", "order_id", "note"],
    filters: { courier_id: courierId },
    pagination: { take: 200, order: { created_at: "DESC" } },
  })
  const itemIds = [...new Set(movements.map((m: any) => m.inventory_item_id))]
  const orderIds = [...new Set(movements.map((m: any) => m.order_id).filter(Boolean))]
  const { data: items } = itemIds.length
    ? await query.graph({ entity: "inventory_item", fields: ["id", "title", "sku", "variants.title", "variants.product.title"], filters: { id: itemIds } })
    : { data: [] }
  const { data: orders } = orderIds.length
    ? await query.graph({ entity: "order", fields: ["id", "custom_display_id", "display_id"], filters: { id: orderIds } })
    : { data: [] }
  const labels = Object.fromEntries(items.map((i: any) => [i.id, itemLabel(i)]))
  const numbers = Object.fromEntries(orders.map((o: any) => [o.id, orderNumberOf(o)]))
  res.json({
    movements: movements.map((m: any) => ({
      id: m.id,
      created_at: m.created_at,
      type: m.type,
      quantity: m.quantity,
      label: labels[m.inventory_item_id] ?? "Article supprimé",
      order_number: m.order_id ? numbers[m.order_id] ?? null : null,
      note: m.note,
    })),
  })
}

// Remise / retour / correction.
export async function POST(req: AuthenticatedMedusaRequest<CourierStockMovementSchema>, res: MedusaResponse) {
  const { result } = await recordCourierStockWorkflow(req.scope).run({
    input: { ...req.validatedBody, note: req.validatedBody.note ?? null },
  })
  res.json({ movements: result })
}
```

Check `orderNumberOf`'s signature in `src/lib/order-number.ts` before use (it is already called with `{ id, custom_display_id, display_id }` in the complete route).

- [ ] **Step 4: Déstockage in the complete route.** In `src/api/admin/deliveries/[id]/complete/route.ts`, add imports:

```ts
import { itemLabel } from "../../../../../lib/courier-stock-rules"
import { takeDeliveryStockWorkflow } from "../../../../../workflows/courier-stock"
```

and, after the `syncOrderAfterDelivery` block and before the cash-journal block:

```ts
  // Stock confié au livreur (spec 2026-09-28 stock-livreurs) : il déstocke ce
  // qu'il détient. Jamais bloquant ; une seconde exécution ne déstocke rien.
  let stockTaken: { label: string; quantity: number }[] = []
  if (delivery.status === "delivered" || delivery.status === "shipped") {
    try {
      const { result: taken } = await takeDeliveryStockWorkflow(req.scope).run({ input: { delivery_id: delivery.id } })
      if (taken.length) {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
        const { data: items } = await query.graph({
          entity: "inventory_item",
          fields: ["id", "title", "sku", "variants.title", "variants.product.title"],
          filters: { id: taken.map((m: any) => m.inventory_item_id) },
        })
        const labels = Object.fromEntries(items.map((i: any) => [i.id, itemLabel(i)]))
        stockTaken = taken.map((m: any) => ({ label: labels[m.inventory_item_id] ?? "Article", quantity: -m.quantity }))
      }
    } catch (error) {
      req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(
        `Stock livreur : livraison ${delivery.id} non déstockée (${(error as Error).message})`
      )
    }
  }
```

The cash block already loads `courier`; hoist `let courierName: string | null = null` above it, set `courierName = courier?.name ?? null` inside, and change the response to:

```ts
  res.json({ delivery: { ...delivery, sync_warning: syncWarning }, sync_warning: syncWarning, stock_taken: stockTaken, courier_name: courierName })
```

- [ ] **Step 5: Typecheck, lint, unit tests**

Run: `npx tsc --noEmit -p . && npm run lint && npm run test:unit`
Expected: no errors, no new lint warnings, all PASS.

- [ ] **Step 6: Local API check** (backend running via `npx medusa develop` in `apps/backend`, session cookie from the local test admin in the scratchpad `local-admin.env`, never printed):
  - `GET /admin/courier-stock` → 200, items with `warehouse = stocked`.
  - `POST /admin/courier-stock/movements` handover 2 of an item with stock → 200 ; `GET` shows `by_courier[c] = 2`, `warehouse = stocked - 2`, `stocked` unchanged.
  - handover more than warehouse → 400 « Stock insuffisant au dépôt ».
  - adjustment counted 1 without note → 400 ; with note → 200, `stocked` down by 1.
  - return 1 → balance 0.

- [ ] **Step 7: Commit**

```bash
git add src/api/admin/courier-stock src/api/admin/deliveries/middlewares.ts "src/api/admin/deliveries/[id]/complete/route.ts"
git commit -m "feat(stock-livreurs): routes admin et déstockage automatique à la livraison"
```

### Task 5: Onglet « Stock livreurs » et retour de « Livrée »

**Files:**
- Create: `apps/backend/src/admin/components/delivery-ui.tsx` (styles et petits composants partagés, extraits de la page)
- Create: `apps/backend/src/admin/components/courier-stock-tab.tsx`
- Modify: `apps/backend/src/admin/lib/deliveries.ts` (types + libellés)
- Modify: `apps/backend/src/admin/routes/deliveries/page.tsx`

**Interfaces:**
- Consumes: Task 4 HTTP contract.
- Produces: `CourierStockTab` (default-less named export), `delivery-ui.tsx` exports `inputClass, primaryButton, secondaryButton, card, Notice, NoticeText, Badge, useCouriers`.

- [ ] **Step 1: Extract shared UI.** Move `inputClass`, `primaryButton`, `secondaryButton`, `card`, `type Notice`, `NoticeText`, `Badge`, `useCouriers` from `page.tsx` (lines 42-82) into `src/admin/components/delivery-ui.tsx` unchanged, each `export`ed, with the imports they need (`useCallback, useEffect, useState` from react; `api`, `Courier` from `../lib/deliveries`). Import them back in `page.tsx`. Run `npx tsc --noEmit -p .` → no errors.

- [ ] **Step 2: Types in `src/admin/lib/deliveries.ts`**

```ts
export type StockMovementType = "handover" | "return" | "delivery" | "adjustment"

export type CourierStockOverview = {
  couriers: { id: string; name: string }[]
  items: { id: string; label: string; stocked: number; warehouse: number; total_couriers: number; by_courier: Record<string, number> }[]
}

export type CourierStockMovement = {
  id: string
  created_at: string
  type: StockMovementType
  quantity: number
  label: string
  order_number: string | null
  note: string | null
}

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  handover: "Remise",
  return: "Retour au dépôt",
  delivery: "Livraison",
  adjustment: "Correction",
}
```

- [ ] **Step 3: Write `courier-stock-tab.tsx`**

```tsx
import { useCallback, useEffect, useState } from "react"
import { api, MOVEMENT_LABELS } from "../lib/deliveries"
import type { CourierStockMovement, CourierStockOverview } from "../lib/deliveries"
import { card, inputClass, NoticeText, primaryButton, secondaryButton } from "./delivery-ui"
import type { Notice } from "./delivery-ui"

// Onglet "Stock livreurs" (spec 2026-09-28 stock-livreurs) : combien il reste
// de chaque produit chez chaque livreur, remises / retours / corrections et
// historique. Cartes empilées, utilisable sur téléphone.

type Mode = "handover" | "return" | "adjustment"
const MODE_LABELS: Record<Mode, string> = { handover: "Remettre", return: "Retour", adjustment: "Corriger" }
type Line = { inventory_item_id: string; quantity: string }

const MovementForm = ({
  mode,
  data,
  onDone,
  onCancel,
}: {
  mode: Mode
  data: CourierStockOverview
  onDone: (notice: Notice) => void
  onCancel: () => void
}) => {
  const [courierId, setCourierId] = useState(data.couriers[0]?.id ?? "")
  const [lines, setLines] = useState<Line[]>([{ inventory_item_id: "", quantity: "" }])
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Produits proposés : au dépôt pour une remise, chez le livreur pour un retour, tous pour une correction.
  const choices = data.items.filter((i) =>
    mode === "handover" ? i.warehouse > 0 : mode === "return" ? (i.by_courier[courierId] ?? 0) > 0 : true
  )
  const hint = (id: string) => {
    const item = data.items.find((i) => i.id === id)
    if (!item) return ""
    return mode === "handover" ? `${item.warehouse} au dépôt` : `${item.by_courier[courierId] ?? 0} chez le livreur`
  }
  const setLine = (index: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)))

  const submit = async () => {
    const parsed = lines
      .filter((l) => l.inventory_item_id)
      .map((l) => ({ inventory_item_id: l.inventory_item_id, quantity: Number(l.quantity) }))
    if (!courierId) return setError("Choisissez un livreur.")
    if (!parsed.length) return setError("Ajoutez au moins un produit.")
    if (parsed.some((l) => l.quantity === 0 && mode !== "adjustment") || parsed.some((l) => !Number.isInteger(l.quantity) || l.quantity < 0)) {
      return setError("Quantité invalide : nombre entier positif.")
    }
    if (mode === "adjustment" && !note.trim()) return setError("Indiquez la raison de la correction.")
    setBusy(true)
    setError(null)
    try {
      await api("/admin/courier-stock/movements", { method: "POST", body: { courier_id: courierId, type: mode, lines: parsed, note: note || null } })
      const name = data.couriers.find((c) => c.id === courierId)?.name ?? ""
      onDone({ kind: "success", text: `${MODE_LABELS[mode]} enregistré(e) pour ${name}.` })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${card} flex flex-col gap-y-2 px-4 py-3`}>
      <span className="txt-compact-small-plus text-ui-fg-base">
        {mode === "handover" ? "Remettre des produits au livreur" : mode === "return" ? "Le livreur rend des produits" : "Corriger après comptage (quantités réellement chez le livreur)"}
      </span>
      <select className={inputClass} value={courierId} onChange={(e) => setCourierId(e.target.value)}>
        {data.couriers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {lines.map((line, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <select className={`${inputClass} min-w-0 flex-1`} value={line.inventory_item_id} onChange={(e) => setLine(index, { inventory_item_id: e.target.value })}>
            <option value="">Produit…</option>
            {choices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
          <input
            className={`${inputClass} max-w-[90px]`}
            inputMode="numeric"
            placeholder={mode === "adjustment" ? "Compté" : "Qté"}
            value={line.quantity}
            onChange={(e) => setLine(index, { quantity: e.target.value })}
          />
          <span className="txt-compact-small text-ui-fg-subtle">{hint(line.inventory_item_id)}</span>
        </div>
      ))}
      <button type="button" className={`${secondaryButton} self-start`} onClick={() => setLines((ls) => [...ls, { inventory_item_id: "", quantity: "" }])}>
        + Produit
      </button>
      <input className={inputClass} placeholder={mode === "adjustment" ? "Raison (obligatoire)" : "Note (facultatif)"} value={note} onChange={(e) => setNote(e.target.value)} />
      <NoticeText notice={error ? { kind: "error", text: error } : null} />
      <div className="flex gap-x-2">
        <button type="button" className={primaryButton} disabled={busy} onClick={submit}>
          {MODE_LABELS[mode]}
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  )
}

const History = ({ courierId }: { courierId: string }) => {
  const [movements, setMovements] = useState<CourierStockMovement[] | null>(null)
  useEffect(() => {
    api<{ movements: CourierStockMovement[] }>(`/admin/courier-stock/movements?courier_id=${encodeURIComponent(courierId)}`)
      .then((r) => setMovements(r.movements))
      .catch(() => setMovements([]))
  }, [courierId])
  if (movements === null) return <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>
  if (!movements.length) return <p className="txt-compact-small text-ui-fg-subtle">Aucun mouvement.</p>
  return (
    <ul className="flex flex-col divide-y divide-ui-border-base">
      {movements.map((m) => (
        <li key={m.id} className="txt-compact-small flex flex-wrap justify-between gap-x-3 py-1.5">
          <span className="text-ui-fg-subtle">
            {new Date(m.created_at).toLocaleDateString("fr-FR")} · {MOVEMENT_LABELS[m.type]}
            {m.order_number ? ` · commande ${m.order_number}` : ""}
            {m.note ? ` · ${m.note}` : ""}
          </span>
          <span className="text-ui-fg-base">
            {m.label} <strong>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</strong>
          </span>
        </li>
      ))}
    </ul>
  )
}

export const CourierStockTab = () => {
  const [data, setData] = useState<CourierStockOverview | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [historyOf, setHistoryOf] = useState<string | null>(null)
  const reload = useCallback(() => {
    api<CourierStockOverview>("/admin/courier-stock")
      .then(setData)
      .catch((e) => setNotice({ kind: "error", text: (e as Error).message }))
  }, [])
  useEffect(reload, [reload])

  if (!data) return <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>
  if (!data.couriers.length) return <p className="txt-compact-small text-ui-fg-subtle">Ajoutez d'abord un livreur (onglet Livreurs).</p>

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
          <button key={m} type="button" className={mode === m ? primaryButton : secondaryButton} onClick={() => setMode(mode === m ? null : m)}>
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
      <NoticeText notice={notice} />
      {mode && (
        <MovementForm
          key={mode}
          mode={mode}
          data={data}
          onCancel={() => setMode(null)}
          onDone={(n) => {
            setNotice(n)
            setMode(null)
            reload()
          }}
        />
      )}
      {data.items.map((item) => (
        <div key={item.id} className={`${card} flex flex-col gap-y-1 px-4 py-3`}>
          <span className="txt-compact-small-plus text-ui-fg-base">{item.label}</span>
          <div className="txt-compact-small flex flex-wrap gap-x-4 gap-y-1 text-ui-fg-subtle">
            <span>
              Au dépôt : <strong className="text-ui-fg-base">{item.warehouse}</strong>
            </span>
            {data.couriers.map((c) => (
              <span key={c.id}>
                {c.name} : <strong className={item.by_courier[c.id] ? "text-ui-fg-base" : ""}>{item.by_courier[c.id] ?? 0}</strong>
              </span>
            ))}
            <span>Total : {item.stocked}</span>
          </div>
        </div>
      ))}
      <div className={`${card} flex flex-col gap-y-2 px-4 py-3`}>
        <span className="txt-compact-small-plus text-ui-fg-base">Historique</span>
        <div className="flex flex-wrap gap-2">
          {data.couriers.map((c) => (
            <button key={c.id} type="button" className={historyOf === c.id ? primaryButton : secondaryButton} onClick={() => setHistoryOf(historyOf === c.id ? null : c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        {historyOf && <History courierId={historyOf} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire the tab in `page.tsx`**
  - `type Tab = "to-assign" | "tour" | "unpaid" | "stock" | "couriers"`
  - In `TABS`, insert `{ id: "stock", label: "Stock livreurs" },` before `couriers`.
  - Import `import { CourierStockTab } from "../../components/courier-stock-tab"` and render `{tab === "stock" && <CourierStockTab />}`.
  - In the tour completion handler (around line 279), type the response `api<{ sync_warning: string | null; stock_taken?: { label: string; quantity: number }[]; courier_name?: string | null }>` and append to the success/warning text:

```ts
      const taken = result.stock_taken?.length
        ? ` Pris dans le stock de ${result.courier_name ?? "livreur"} : ${result.stock_taken.map((t) => `${t.quantity} ${t.label}`).join(", ")}.`
        : ""
```

  adding `${taken}` at the end of both notice texts.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: no errors.

- [ ] **Step 6: Local browser check (Playwright MCP, screenshots under `.playwright-mcp/`)** at 1280 px and 390 px width: tab visible; Remettre 2 then card shows courier 2 / dépôt −2 / total unchanged; Retour; Corriger with note; history lists them. Then assign a real local order containing that product to the courier, mark it « Livrée »: notice « Pris dans le stock de … », courier balance down, history line « Livraison · commande … ». Call `POST /admin/deliveries/:id/complete` a second time with the same body (whatever it answers) and confirm the history still has a single « Livraison » movement per product.

- [ ] **Step 7: Commit**

```bash
git add src/admin
git commit -m "feat(stock-livreurs): onglet Stock livreurs (remise, retour, correction, historique)"
```

### Task 6: Documentation, déploiement, QA production

**Files:**
- Modify: `AGENTS.md` (section « Livreurs et livraisons »)
- Modify: `HANDOFF.md`
- Modify: memory `mini-saas-gestion-livreurs.md`

- [ ] **Step 1: Docs.** In `AGENTS.md`, append to the delivery section: table `courier_stock_movement` (solde = somme), workflows `src/workflows/courier-stock.ts`, règles `src/lib/courier-stock-rules.ts`, routes `/admin/courier-stock`, `/admin/courier-stock/movements`, onglet « Stock livreurs », rule « stock Medusa = total possédé, seule la correction l'ajuste ; déstockage automatique à Livrée/Déposée, non bloquant, une fois par livraison ». Spec path. Update HANDOFF.md « livré » list.

- [ ] **Step 2: Full check then commit**

Run: `npx tsc --noEmit -p . && npm run lint && npm run test:unit`
Expected: all PASS.

```bash
git add AGENTS.md HANDOFF.md
git commit -m "docs(agents): stock confié aux livreurs"
```

- [ ] **Step 3: Staging.** `git push origin staging`; wait for the GitHub Actions deploy; on the VPS, check the migration ran (`courier_stock_movement` exists in staging Postgres) and `GET /admin/courier-stock` returns 200 with `MEDUSA_ADMIN_KEY_STAGING` from the n8n container. Handover 1 of a product to a staging courier, check the overview, return it (balance back to 0).

- [ ] **Step 4: Production.** `git push origin staging:main`; wait for the deploy; same checks with `MEDUSA_ADMIN_KEY_PRODUCTION` (read-only GET only, no movement on real data), table exists.

- [ ] **Step 5: Memory.** Update `mini-saas-gestion-livreurs.md` (stock livreurs livré, date) and its MEMORY.md line.
