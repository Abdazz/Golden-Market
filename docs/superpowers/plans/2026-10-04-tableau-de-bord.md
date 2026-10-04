# Tableau de bord de gestion — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** une page admin « Tableau de bord » (`/app/dashboard`) qui montre « À faire aujourd'hui » puis les chiffres du jour et du mois, alimentée par une route unique `GET /admin/dashboard`.

**Architecture:** calculs purs dans `src/lib/dashboard-rules.ts` (testés en TDD) ; lectures dans `src/lib/dashboard-query.ts`, un chargeur par bloc, qui réutilisent les règles existantes ; trois extractions de code déjà présent dans des routes (commandes à confier, marge du mois, disponibilité des variantes des prospects) pour partager exactement les mêmes chiffres ; la route assemble les blocs avec `Promise.allSettled` (un bloc en échec → `{ available: false }`). Page admin en HTML natif + classes Medusa.

**Tech Stack:** Medusa v2.18 (`query.graph`, routes API fichier, `defineRouteConfig`), Jest (`test:unit`), React (admin), `pg` (base du chat via `listConversations`).

**Spec:** `docs/superpowers/specs/2026-10-04-tableau-de-bord-design.md`

## Global Constraints

- Code, commentaires, UI, messages de commit en français ; aucun emoji dans le code ; aucun trailer Co-Authored-By.
- Jours en UTC (`todayInOuaga`, `dayOf` de `lib/delivery-rules`), mois `AAAA-MM` (`monthOf` de `lib/cashbook-rules`).
- Montants en FCFA entiers ; affichage via `formatXof` (`src/admin/lib/deliveries.ts`).
- Admin : aucun composant `@medusajs/ui` (conflit de types React 18/19) ; HTML natif et classes utilitaires (`txt-*`, `text-ui-fg-*`, `bg-ui-bg-base shadow-elevation-card-rest rounded-lg`).
- `query.graph` sur `order` : toujours `items.*`, `summary.*`, `shipping_methods.*` (sinon `total` vaut 0).
- Lecture seule : la page ne modifie rien.
- Tests unitaires : `cd apps/backend && npm run test:unit -- <chemin>` (le gestionnaire est npm : vérifier `package-lock.json` à la racine avant de lancer).

## Review Focus

1. Base du chat injoignable (`WHATSAPP_CHAT_DATABASE_URL` absente ou Postgres arrêté) : seule la ligne « Conversations » doit dire « indisponible », la page et les autres blocs restent normaux. Testé dans Task 1 (`settleBlocks`) et vérifié en local dans Task 5 (variable retirée).
2. Livraison terminée un jour **déjà validé** puis une autre le même jour (« Rouvrir la journée » non utilisé) : le jour validé reste exclu ; seuls les jours non validés comptent. Testé dans Task 1.
3. Commande créée à 23 h 59 le dernier jour du mois / à 00 h 01 le 1er : comptée dans le bon mois et le bon jour (UTC). Testé dans Task 1.
4. Un remboursement le même jour qu'une vente : « Encaissé » = vente moins remboursement, peut être négatif sur la journée. Testé dans Task 1.
5. Les extractions ne changent rien pour les pages existantes : `to-assign`, `margins` et `prospects` renvoient la même réponse avant / après. Vérifié dans Task 2 (types + tests) et Task 5 (comparaison JSON sur staging).

---

### Task 1: Règles pures du tableau de bord

**Files:**
- Create: `apps/backend/src/lib/dashboard-rules.ts`
- Test: `apps/backend/src/lib/__tests__/dashboard-rules.unit.spec.ts`

**Interfaces:**
- Consumes: `computeSettlement`, `dayOf`, `DeliveryLike` (`lib/delivery-rules`) ; `monthOf`, `EntryLike` (`lib/cashbook-rules`).
- Produces:
  - `type CourierDelivery = DeliveryLike & { courier_id: string }`
  - `unremittedByCourier(deliveries: CourierDelivery[], validated: { courier_id: string; day: string }[]): { courier_id: string; amount: number; days: number }[]`
  - `countInProgress(deliveries: { status: string; tour_date: string }[], today: string): { count: number; late: number }`
  - `orderedTotals(orders: { created_at: Date | string; total: number | string | null; status: string }[], today: string, month: string): { today: Totals; month: Totals }` avec `type Totals = { count: number; amount: number }`
  - `collectedTotals(entries: EntryLike[], today: string, month: string): { today: number; month: number }`
  - `type Block<T> = ({ available: true } & T) | { available: false }`
  - `settleBlocks<L extends Record<string, () => Promise<object>>>(loaders: L, log?: (key: string, error: unknown) => void): Promise<{ [K in keyof L]: Block<Awaited<ReturnType<L[K]>>> }>`

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
import {
  collectedTotals,
  countInProgress,
  orderedTotals,
  settleBlocks,
  unremittedByCourier,
  type CourierDelivery,
} from "../dashboard-rules"
import type { EntryLike } from "../cashbook-rules"

const d = (over: Partial<CourierDelivery>): CourierDelivery => ({
  courier_id: "c1",
  status: "delivered",
  type: "express",
  tour_date: "2026-10-03",
  completed_at: "2026-10-03T15:00:00Z",
  amount_to_collect: 6500,
  amount_collected: 6500,
  courier_fee: 1000,
  transport_fee: null,
  ...over,
})

describe("unremittedByCourier", () => {
  it("additionne par livreur les journées terminées sans versement validé", () => {
    const result = unremittedByCourier(
      [
        d({}),
        d({ completed_at: "2026-10-04T09:00:00Z", amount_collected: 9000, courier_fee: 1500 }),
        d({ courier_id: "c2", amount_collected: 3000, courier_fee: 500 }),
      ],
      []
    )
    expect(result).toEqual([
      { courier_id: "c1", amount: 5500 + 7500, days: 2 },
      { courier_id: "c2", amount: 2500, days: 1 },
    ])
  })

  it("exclut les journées déjà validées, même si une livraison s'y ajoute", () => {
    const result = unremittedByCourier(
      [d({}), d({ completed_at: "2026-10-03T18:00:00Z" }), d({ completed_at: "2026-10-04T09:00:00Z" })],
      [{ courier_id: "c1", day: "2026-10-03" }]
    )
    expect(result).toEqual([{ courier_id: "c1", amount: 5500, days: 1 }])
  })

  it("ignore les livraisons non terminées et garde un montant négatif (frais > encaissé)", () => {
    const result = unremittedByCourier(
      [
        d({ status: "assigned", completed_at: null }),
        d({ status: "failed", amount_collected: null, courier_fee: 1000 }),
      ],
      []
    )
    expect(result).toEqual([{ courier_id: "c1", amount: -1000, days: 1 }])
  })

  it("ne compte pas une journée dont le montant est nul", () => {
    expect(unremittedByCourier([d({ amount_collected: 0, courier_fee: 0 })], [])).toEqual([])
  })
})

describe("countInProgress", () => {
  it("compte les livraisons en cours et celles prévues avant aujourd'hui", () => {
    const result = countInProgress(
      [
        { status: "assigned", tour_date: "2026-10-04" },
        { status: "assigned", tour_date: "2026-10-02" },
        { status: "delivered", tour_date: "2026-10-01" },
      ],
      "2026-10-04"
    )
    expect(result).toEqual({ count: 2, late: 1 })
  })
})

describe("orderedTotals", () => {
  it("répartit les commandes entre le jour et le mois, aux bornes UTC, hors annulées", () => {
    const result = orderedTotals(
      [
        { created_at: "2026-09-30T23:59:00Z", total: 5000, status: "pending" },
        { created_at: "2026-10-01T00:01:00Z", total: 7000, status: "pending" },
        { created_at: "2026-10-04T08:00:00Z", total: "9500", status: "completed" },
        { created_at: "2026-10-04T09:00:00Z", total: 3000, status: "canceled" },
      ],
      "2026-10-04",
      "2026-10"
    )
    expect(result).toEqual({ today: { count: 1, amount: 9500 }, month: { count: 2, amount: 16500 } })
  })
})

describe("collectedTotals", () => {
  const e = (over: Partial<EntryLike>): EntryLike => ({ id: "x", date: "2026-10-04T10:00:00Z", direction: "in", amount: 1000, category: "sale", ...over })

  it("ventes moins remboursements, jour et mois ; les autres écritures ne comptent pas", () => {
    const result = collectedTotals(
      [
        e({ amount: 10000 }),
        e({ direction: "out", category: "refund", amount: 12000 }),
        e({ date: "2026-10-02T10:00:00Z", amount: 8000 }),
        e({ date: "2026-09-30T10:00:00Z", amount: 50000 }),
        e({ direction: "out", category: "purchase", amount: 20000 }),
      ],
      "2026-10-04",
      "2026-10"
    )
    expect(result).toEqual({ today: -2000, month: 6000 })
  })
})

describe("settleBlocks", () => {
  it("marque disponible chaque bloc réussi et indisponible celui qui échoue, sans bloquer les autres", async () => {
    const log = jest.fn()
    const result = await settleBlocks(
      {
        ok: async () => ({ count: 3 }),
        chat: async () => {
          throw new Error("base du chat indisponible")
        },
      },
      log
    )
    expect(result).toEqual({ ok: { available: true, count: 3 }, chat: { available: false } })
    expect(log).toHaveBeenCalledWith("chat", expect.any(Error))
  })
})
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/dashboard-rules.unit.spec.ts`
Expected: FAIL, « Cannot find module '../dashboard-rules' ».

- [ ] **Step 3: Implémenter**

```ts
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
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/dashboard-rules.unit.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/dashboard-rules.ts apps/backend/src/lib/__tests__/dashboard-rules.unit.spec.ts
git commit -m "feat(tableau-de-bord): règles de calcul (argent des livreurs, commandé, encaissé, blocs isolés)"
```

---

### Task 2: Extraire les calculs partagés des routes existantes

Refactoring sans changement de comportement : la réponse JSON des trois routes reste identique.

**Files:**
- Create: `apps/backend/src/lib/delivery-to-assign.ts` (depuis `api/admin/deliveries/to-assign/route.ts`)
- Create: `apps/backend/src/lib/procurement-margin.ts` (depuis `api/admin/margins/route.ts`)
- Create: `apps/backend/src/lib/prospect-query.ts` (depuis `api/admin/prospects/route.ts`)
- Modify: les trois routes ci-dessus

**Interfaces:**
- Produces:
  - `loadOrdersToAssign(scope): Promise<OrderToAssignRow[]>` (mêmes champs que la réponse actuelle : `id, order_number, created_at, customer_name, customer_phone, city, address, total, paid, redeliver, last_failure`)
  - `loadVariantCosts(scope): Promise<Map<string, number>>`
  - `computeMonthMargin(scope, month: string, costs: Map<string, number>): Promise<{ revenue: number; cost: number; margin: number; orders: number; unknown_cost_items: number }>`
  - `loadVariantSummaries(query, variantIds: string[]): Promise<{ titles: Record<string, string>; availability: Record<string, boolean> }>`

- [ ] **Step 1: Noter la sortie actuelle des trois routes (référence de non-régression)**

Sur staging, depuis le conteneur n8n (script copié par `docker cp`, supprimé ensuite avec `docker exec -u root golden_market_n8n rm ...`), appeler `GET /admin/deliveries/to-assign`, `GET /admin/margins`, `GET /admin/prospects` avec `MEDUSA_ADMIN_KEY_STAGING` et enregistrer les trois JSON dans le scratchpad (`before-*.json`). Le script :

```js
// /tmp/snap.js — node /tmp/snap.js <prefix>
const base = process.env.MEDUSA_BACKEND_URL
const key = process.env.MEDUSA_ADMIN_KEY_STAGING
const auth = "Basic " + Buffer.from(key + ":").toString("base64")
;(async () => {
  for (const path of ["/admin/deliveries/to-assign", "/admin/margins", "/admin/prospects"]) {
    const res = await fetch(base + path, { headers: { Authorization: auth } })
    console.log("=== " + path + " " + res.status)
    console.log(JSON.stringify(await res.json()))
  }
})()
```

- [ ] **Step 2: Créer `lib/delivery-to-assign.ts` et faire appeler la route**

```ts
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ORDER_FIELDS, customerName, isPaid, isShippedOrDelivered } from "./delivery-service-helpers"
import { orderNumberOf } from "./order-number"

// Commandes à confier : non annulées, pas encore livrées ni expédiées, sans
// livraison en cours (y compris les échecs "à relivrer"). 200 plus récentes.
// Partagé par l'onglet "À confier" et le tableau de bord.
export async function loadOrdersToAssign(scope: { resolve: (key: string) => any }) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: { status: { $nin: ["canceled", "draft", "archived"] } },
    pagination: { take: 200, order: { created_at: "DESC" } },
  })
  const { data: deliveries } = await query.graph({
    entity: "delivery",
    fields: ["id", "order_id", "status", "redeliver", "assigned_at"],
    filters: { order_id: orders.map((o: any) => o.id) },
  })
  const byOrder = new Map<string, any[]>()
  for (const d of deliveries) byOrder.set(d.order_id, [...(byOrder.get(d.order_id) ?? []), d])

  return orders
    .filter((o: any) => !isShippedOrDelivered(o))
    .filter((o: any) => !(byOrder.get(o.id) ?? []).some((d) => ["assigned", "delivered", "shipped"].includes(d.status)))
    .map((o: any) => {
      const last = (byOrder.get(o.id) ?? []).sort(
        (a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()
      )[0]
      return {
        id: o.id as string,
        order_number: orderNumberOf(o),
        created_at: o.created_at,
        customer_name: customerName(o),
        customer_phone: o.shipping_address?.phone ?? "",
        city: o.shipping_address?.city ?? null,
        address: o.shipping_address?.address_1 ?? null,
        total: o.total,
        paid: isPaid(o),
        redeliver: Boolean(last && last.status === "failed" && last.redeliver),
        last_failure: last && last.status === "failed" ? last.status : null,
      }
    })
}
```

`api/admin/deliveries/to-assign/route.ts` devient :

```ts
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadOrdersToAssign } from "../../../../lib/delivery-to-assign"

// Commandes à confier (règle dans lib/delivery-to-assign, partagée avec le tableau de bord).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json({ orders: await loadOrdersToAssign(req.scope) })
}
```

- [ ] **Step 3: Créer `lib/procurement-margin.ts` et faire appeler la route**

```ts
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { monthOf } from "./cashbook-rules"
import { CASHBOOK_MODULE } from "../modules/cashbook"
import { PROCUREMENT_MODULE } from "../modules/procurement"

type Scope = { resolve: (key: string) => any }

// Coût de revient courant de chaque variante (onglet Marges).
export async function loadVariantCosts(scope: Scope): Promise<Map<string, number>> {
  const procurement = scope.resolve(PROCUREMENT_MODULE) as any
  return new Map<string, number>(
    (await procurement.listVariantCosts({})).map((c: any) => [c.variant_id, c.unit_cost_xof])
  )
}

// Marge brute du mois sur les commandes encaissées ce mois-là (ventes du
// journal de caisse). Partagé par l'onglet Marges et le tableau de bord.
export async function computeMonthMargin(scope: Scope, month: string, costs: Map<string, number>) {
  const cashbook = scope.resolve(CASHBOOK_MODULE) as any
  const sales = (await cashbook.listCashEntries({ category: "sale" })).filter(
    (e: any) => e.order_id && monthOf(e.date) === month
  )
  const orderIds = [...new Set(sales.map((e: any) => e.order_id))] as string[]
  let revenue = 0
  let cost = 0
  let unknownCostItems = 0
  if (orderIds.length) {
    const query = scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({ entity: "order", fields: ["id", "status", "items.*"], filters: { id: orderIds } })
    for (const order of orders.filter((o: any) => o.status !== "canceled")) {
      for (const item of (order.items ?? []) as any[]) {
        if (!item?.variant_id) continue
        const unitCost = costs.get(item.variant_id)
        if (unitCost === undefined) {
          unknownCostItems += Number(item.quantity)
          continue
        }
        revenue += Number(item.unit_price) * Number(item.quantity)
        cost += unitCost * Number(item.quantity)
      }
    }
  }
  return { revenue, cost, margin: revenue - cost, orders: orderIds.length, unknown_cost_items: unknownCostItems }
}
```

`api/admin/margins/route.ts` devient :

```ts
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { monthOf } from "../../../lib/cashbook-rules"
import { computeMonthMargin, loadVariantCosts } from "../../../lib/procurement-margin"
import { margin } from "../../../lib/procurement-rules"
import { loadVariantInfos } from "../../../lib/procurement-query"

// Marges (spec 2026-09-28 approvisionnement-marges) : par variante (coût de
// revient courant, prix de vente, marge) et marge brute du mois sur les
// commandes encaissées ce mois-là (ventes du journal de caisse).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const requested = String(req.query.month ?? "")
  const month = /^\d{4}-\d{2}$/.test(requested) ? requested : monthOf(new Date())
  const infos = await loadVariantInfos(req.scope)
  const costs = await loadVariantCosts(req.scope)

  const variants = [...infos.entries()]
    .map(([variant_id, info]) => {
      const unitCost = costs.get(variant_id) ?? null
      const m = margin(unitCost, info.price)
      return { variant_id, ...info, unit_cost_xof: unitCost, margin_xof: m.unit, margin_percent: m.percent }
    })
    .sort((a, b) => (a.product_title + (a.variant_title ?? "")).localeCompare(b.product_title + (b.variant_title ?? ""), "fr"))

  res.json({ month, variants, month_margin: await computeMonthMargin(req.scope, month, costs) })
}
```

- [ ] **Step 4: Créer `lib/prospect-query.ts` et faire appeler la route**

```ts
import { getTotalVariantAvailability } from "@medusajs/framework/utils"
import { computeAvailability } from "./meta-catalog-mapping"

// Nom affiché et disponibilité des variantes suivies par les prospects.
// Partagé par la page Prospects et le tableau de bord.
export async function loadVariantSummaries(query: any, variantIds: string[]) {
  const titles: Record<string, string> = {}
  const availability: Record<string, boolean> = {}
  if (!variantIds.length) return { titles, availability }
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "title", "manage_inventory", "allow_backorder", "product.title", "product.handle"],
    filters: { id: variantIds },
  })
  const stock = await getTotalVariantAvailability(query, { variant_ids: variants.map((v: any) => v.id) })
  for (const v of variants) {
    // Variante unique de Medusa ("Default Title") : le nom du produit suffit.
    const generic = !v.title || ["Default Title", "Default variant"].includes(v.title)
    titles[v.id] = v.product?.title ? (generic ? v.product.title : `${v.product.title} - ${v.title}`) : v.title
    availability[v.id] = computeAvailability(v, stock[v.id]?.availability ?? null) === "in stock"
  }
  return { titles, availability }
}
```

Dans `api/admin/prospects/route.ts` (`GET`), remplacer le bloc qui va de `const titles: Record<string, string> = {}` jusqu'à la fin du `if (variantIds.length) { ... }` par :

```ts
  const { titles, availability } = await loadVariantSummaries(query, variantIds)
```

et ajuster les imports : retirer `getTotalVariantAvailability` et `computeAvailability`, ajouter `import { loadVariantSummaries } from "../../../lib/prospect-query"`. Le reste de la route (`withTitle`, filtre de recherche, `POST`) ne change pas.

- [ ] **Step 5: Vérifier types et tests**

Run: `cd apps/backend && npx tsc --noEmit -p . 2>&1 | grep -E "lib/(delivery-to-assign|procurement-margin|prospect-query)|admin/(deliveries/to-assign|margins|prospects)/route" ; npm run test:unit`
Expected: aucune erreur de type sur ces fichiers ; toute la suite unitaire PASS (comme avant la tâche).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/lib/delivery-to-assign.ts apps/backend/src/lib/procurement-margin.ts apps/backend/src/lib/prospect-query.ts apps/backend/src/api/admin/deliveries/to-assign/route.ts apps/backend/src/api/admin/margins/route.ts apps/backend/src/api/admin/prospects/route.ts
git commit -m "refactor: commandes à confier, marge du mois et disponibilité des prospects partagées (tableau de bord)"
```

La comparaison avant / après des JSON se fait sur staging à la Task 5.

---

### Task 3: Chargements et route `GET /admin/dashboard`

**Files:**
- Create: `apps/backend/src/lib/dashboard-query.ts`
- Create: `apps/backend/src/api/admin/dashboard/route.ts`

**Interfaces:**
- Consumes: Task 1 (`unremittedByCourier`, `countInProgress`, `orderedTotals`, `collectedTotals`, `settleBlocks`) ; Task 2 (`loadOrdersToAssign`, `loadVariantCosts`, `computeMonthMargin`, `loadVariantSummaries`) ; `dueToday`, `sortWaiting` ; `loadAllEntries`, `summarizeMonth`, `monthOf` ; `balances` ; `listConversations` ; `DELIVERY_FIELDS` ; `todayInOuaga`.
- Produces: `GET /admin/dashboard` → `{ today, month, todo: { to_assign, in_progress, courier_money, prospects, conversations }, figures: { ordered, collected, cash, margin, courier_stock } }` (chaque bloc `{ available: true, ... } | { available: false }`, champs exacts ci-dessous). Consommé par Task 4.

Les chargeurs sont de fines couches de lecture sans logique propre (les calculs sont dans Task 1 / Task 2, déjà testés) : ils sont vérifiés par l'appel réel de la Task 5, pas par des tests unitaires à base de mocks de `query.graph`.

- [ ] **Step 1: Écrire `lib/dashboard-query.ts`**

```ts
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { loadAllEntries } from "./cashbook-query"
import { summarizeMonth } from "./cashbook-rules"
import { balances } from "./courier-stock-rules"
import { collectedTotals, countInProgress, orderedTotals, unremittedByCourier } from "./dashboard-rules"
import { loadOrdersToAssign } from "./delivery-to-assign"
import { DELIVERY_FIELDS } from "./delivery-service-helpers"
import { computeMonthMargin, loadVariantCosts } from "./procurement-margin"
import { loadVariantSummaries } from "./prospect-query"
import { dueToday, sortWaiting } from "./prospect-rules"
import { listConversations } from "./whatsapp-chat-db"
import { PROSPECTS_MODULE } from "../modules/prospects"

// Lectures du tableau de bord (spec 2026-10-04 tableau-de-bord) : un chargeur
// par bloc, les calculs restent dans les règles partagées avec les pages détaillées.

type Scope = { resolve: (key: string) => any }
const queryOf = (scope: Scope) => scope.resolve(ContainerRegistrationKeys.QUERY)

const courierNames = async (scope: Scope) => {
  const { data } = await queryOf(scope).graph({ entity: "courier", fields: ["id", "name"] })
  return new Map<string, string>(data.map((c: any) => [c.id, c.name]))
}

export const loadToAssign = async (scope: Scope) => {
  const orders = await loadOrdersToAssign(scope)
  return { count: orders.length, redeliver: orders.filter((o) => o.redeliver).length }
}

export const loadInProgress = async (scope: Scope, today: string) => {
  const { data } = await queryOf(scope).graph({
    entity: "delivery",
    fields: ["id", "status", "tour_date"],
    filters: { status: "assigned" },
  })
  return countInProgress(data, today)
}

export const loadCourierMoney = async (scope: Scope) => {
  const query = queryOf(scope)
  const { data: deliveries } = await query.graph({
    entity: "delivery",
    fields: DELIVERY_FIELDS,
    filters: { status: ["delivered", "failed", "shipped"] },
  })
  const { data: settlements } = await query.graph({ entity: "courier_settlement", fields: ["courier_id", "day"] })
  const names = await courierNames(scope)
  const couriers = unremittedByCourier(deliveries, settlements)
    .map((c) => ({ id: c.courier_id, name: names.get(c.courier_id) ?? "Livreur supprimé", amount: c.amount, days: c.days }))
    .sort((a, b) => b.amount - a.amount)
  return { total: couriers.reduce((s, c) => s + c.amount, 0), couriers }
}

export const loadProspects = async (scope: Scope, today: string) => {
  const svc = scope.resolve(PROSPECTS_MODULE) as any
  const all = await svc.listProspects({})
  const waitingIds = [
    ...new Set(all.filter((p: any) => p.status === "waiting_stock" && p.variant_id).map((p: any) => p.variant_id)),
  ] as string[]
  const { availability } = await loadVariantSummaries(queryOf(scope), waitingIds)
  const due = dueToday(all, today)
  return {
    due: due.length,
    overdue: due.filter((p) => p.overdue).length,
    back_in_stock: sortWaiting(all, availability).filter((p) => p.available === true).length,
  }
}

export const loadConversations = async () => {
  const conversations = await listConversations()
  if (!conversations) throw new Error("base du chat indisponible")
  return { awaiting: conversations.filter((c) => c.awaitingReply).length }
}

export const loadOrdered = async (scope: Scope, today: string, month: string) => {
  const { data } = await queryOf(scope).graph({
    entity: "order",
    // items / summary / shipping_methods en entier, sinon total vaut 0 (piège connu).
    fields: ["id", "status", "created_at", "total", "items.*", "summary.*", "shipping_methods.*"],
    filters: { created_at: { $gte: new Date(`${month}-01T00:00:00Z`) } },
  })
  return orderedTotals(data, today, month)
}

export const loadCashFigures = async (scope: Scope, today: string, month: string) => {
  const entries = await loadAllEntries(scope)
  const summary = summarizeMonth(entries, month)
  const balance = entries.reduce((s: number, e: any) => s + (e.direction === "in" ? e.amount : -e.amount), 0)
  return {
    collected: collectedTotals(entries, today, month),
    cash: { balance, month_in: summary.income, month_out: summary.expenses },
  }
}

export const loadMargin = async (scope: Scope, month: string) =>
  computeMonthMargin(scope, month, await loadVariantCosts(scope))

export const loadCourierStock = async (scope: Scope) => {
  const { data } = await queryOf(scope).graph({
    entity: "courier_stock_movement",
    fields: ["courier_id", "inventory_item_id", "quantity"],
  })
  const names = await courierNames(scope)
  const couriers = Object.entries(balances(data))
    .map(([id, items]) => ({ id, name: names.get(id) ?? "Livreur supprimé", quantity: Object.values(items).reduce((s, q) => s + q, 0) }))
    .filter((c) => c.quantity !== 0)
    .sort((a, b) => b.quantity - a.quantity)
  return { total: couriers.reduce((s, c) => s + c.quantity, 0), couriers }
}
```

- [ ] **Step 2: Écrire la route**

`apps/backend/src/api/admin/dashboard/route.ts` :

```ts
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { monthOf } from "../../../lib/cashbook-rules"
import { settleBlocks } from "../../../lib/dashboard-rules"
import {
  loadCashFigures,
  loadConversations,
  loadCourierMoney,
  loadCourierStock,
  loadInProgress,
  loadMargin,
  loadOrdered,
  loadProspects,
  loadToAssign,
} from "../../../lib/dashboard-query"
import { todayInOuaga } from "../../../lib/delivery-rules"

// Tableau de bord (spec 2026-10-04 tableau-de-bord) : "À faire aujourd'hui"
// et chiffres du jour / du mois. Chaque bloc est indépendant : un bloc en
// échec est renvoyé { available: false } sans empêcher les autres.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const today = todayInOuaga()
  const month = monthOf(new Date())
  const scope = req.scope
  const blocks = await settleBlocks({
    to_assign: () => loadToAssign(scope),
    in_progress: () => loadInProgress(scope, today),
    courier_money: () => loadCourierMoney(scope),
    prospects: () => loadProspects(scope, today),
    conversations: () => loadConversations(),
    ordered: () => loadOrdered(scope, today, month),
    cash_figures: () => loadCashFigures(scope, today, month),
    margin: () => loadMargin(scope, month),
    courier_stock: () => loadCourierStock(scope),
  })
  const cash = blocks.cash_figures
  res.json({
    today,
    month,
    todo: {
      to_assign: blocks.to_assign,
      in_progress: blocks.in_progress,
      courier_money: blocks.courier_money,
      prospects: blocks.prospects,
      conversations: blocks.conversations,
    },
    figures: {
      ordered: blocks.ordered,
      collected: cash.available ? { available: true, ...cash.collected } : { available: false },
      cash: cash.available ? { available: true, ...cash.cash } : { available: false },
      margin: blocks.margin,
      courier_stock: blocks.courier_stock,
    },
  })
}
```

Les routes sous `/admin/*` sont authentifiées par Medusa par défaut : pas de middleware à ajouter (pas de corps à valider).

- [ ] **Step 3: Vérifier les types**

Run: `cd apps/backend && npx tsc --noEmit -p . 2>&1 | grep -E "dashboard"`
Expected: aucune sortie.

- [ ] **Step 4: Vérifier en local**

Démarrer le backend local (`cd apps/backend && npx medusa develop`, avec `WHATSAPP_CHAT_DATABASE_URL` vers `golden_market_chat_test`, cf. HANDOFF-PROMPT), se connecter avec l'admin de test, puis `curl -s -b <cookie> http://localhost:9000/admin/dashboard | jq`.
Expected: JSON complet, tous les blocs `available: true`. Relancer sans `WHATSAPP_CHAT_DATABASE_URL` : seul `todo.conversations` vaut `{ "available": false }`, journal `[dashboard] conversations : Error: base du chat indisponible`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/dashboard-query.ts apps/backend/src/api/admin/dashboard/route.ts
git commit -m "feat(tableau-de-bord): route GET /admin/dashboard"
```

---

### Task 4: Page admin « Tableau de bord »

**Files:**
- Create: `apps/backend/src/admin/routes/dashboard/page.tsx`

**Interfaces:**
- Consumes: réponse de `GET /admin/dashboard` (Task 3) ; `api`, `formatXof` (`src/admin/lib/deliveries.ts`).
- Produces: route admin `/app/dashboard`, entrée de menu « Tableau de bord » en tête (`rank: 0`).

Charger le skill `medusa-dev:building-admin-dashboard-customizations` avant d'écrire la page (règle du projet).

- [ ] **Step 1: Écrire la page**

```tsx
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChartBar } from "@medusajs/icons"
import { useCallback, useEffect, useState } from "react"
import { api, formatXof } from "../../lib/deliveries"

// Page "Tableau de bord" (spec 2026-10-04 tableau-de-bord) : "À faire
// aujourd'hui" puis chiffres du jour et du mois, en lecture seule ; chaque
// ligne mène à la page qui permet d'agir. Pas de composant @medusajs/ui
// (conflit de types React 18/19) : HTML natif + classes utilitaires Medusa.

type Block<T> = ({ available: true } & T) | { available: false }
type Totals = { count: number; amount: number }
type Dashboard = {
  today: string
  month: string
  todo: {
    to_assign: Block<{ count: number; redeliver: number }>
    in_progress: Block<{ count: number; late: number }>
    courier_money: Block<{ total: number; couriers: { id: string; name: string; amount: number; days: number }[] }>
    prospects: Block<{ due: number; overdue: number; back_in_stock: number }>
    conversations: Block<{ awaiting: number }>
  }
  figures: {
    ordered: Block<{ today: Totals; month: Totals }>
    collected: Block<{ today: number; month: number }>
    cash: Block<{ balance: number; month_in: number; month_out: number }>
    margin: Block<{ revenue: number; cost: number; margin: number; orders: number; unknown_cost_items: number }>
    courier_stock: Block<{ total: number; couriers: { id: string; name: string; quantity: number }[] }>
  }
}

const card = "bg-ui-bg-base shadow-elevation-card-rest rounded-lg p-4"
const secondaryButton =
  "txt-compact-small-plus rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-ui-fg-base disabled:opacity-50"
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`
const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })

const Unavailable = () => <p className="txt-compact-small text-ui-fg-muted">Indisponible pour le moment.</p>

// Ligne "À faire" : grisée quand il n'y a rien à faire.
const TodoCard = ({ title, value, empty, href, children }: { title: string; value: string; empty: boolean; href: string; children?: React.ReactNode }) => (
  <a href={href} className={`${card} block transition-colors hover:bg-ui-bg-base-hover ${empty ? "opacity-60" : ""}`}>
    <p className="txt-compact-small text-ui-fg-subtle">{title}</p>
    <p className="txt-xlarge-plus text-ui-fg-base mt-1">{value}</p>
    <div className="txt-compact-small text-ui-fg-muted mt-1">{children}</div>
  </a>
)

const TodoSection = ({ todo }: { todo: Dashboard["todo"] }) => {
  const { to_assign, in_progress, courier_money, prospects, conversations } = todo
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {to_assign.available ? (
        <TodoCard title="Commandes à confier" value={String(to_assign.count)} empty={to_assign.count === 0} href="/app/deliveries?tab=to-assign">
          {to_assign.redeliver > 0 ? `dont ${to_assign.redeliver} à relivrer` : "à donner à un livreur"}
        </TodoCard>
      ) : (
        <div className={card}><p className="txt-compact-small text-ui-fg-subtle">Commandes à confier</p><Unavailable /></div>
      )}
      {in_progress.available ? (
        <TodoCard title="Livraisons en cours" value={String(in_progress.count)} empty={in_progress.count === 0} href="/app/deliveries?tab=tour">
          {in_progress.late > 0 ? `dont ${in_progress.late} en retard` : "aucune en retard"}
        </TodoCard>
      ) : (
        <div className={card}><p className="txt-compact-small text-ui-fg-subtle">Livraisons en cours</p><Unavailable /></div>
      )}
      {courier_money.available ? (
        <TodoCard title="Argent à récupérer chez les livreurs" value={formatXof(courier_money.total)} empty={courier_money.couriers.length === 0} href="/app/deliveries?tab=tour">
          {courier_money.couriers.length === 0
            ? "tous les versements sont validés"
            : courier_money.couriers.map((c) => `${c.name} : ${formatXof(c.amount)} (${plural(c.days, "jour")})`).join(" · ")}
        </TodoCard>
      ) : (
        <div className={card}><p className="txt-compact-small text-ui-fg-subtle">Argent à récupérer chez les livreurs</p><Unavailable /></div>
      )}
      {prospects.available ? (
        <TodoCard title="Prospects à relancer" value={String(prospects.due)} empty={prospects.due === 0 && prospects.back_in_stock === 0} href="/app/prospects">
          {[
            prospects.overdue > 0 ? `dont ${prospects.overdue} en retard` : null,
            prospects.back_in_stock > 0 ? `${prospects.back_in_stock} en attente : produit de retour en stock` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "rien à relancer"}
        </TodoCard>
      ) : (
        <div className={card}><p className="txt-compact-small text-ui-fg-subtle">Prospects à relancer</p><Unavailable /></div>
      )}
      {conversations.available ? (
        <TodoCard title="Conversations en attente" value={String(conversations.awaiting)} empty={conversations.awaiting === 0} href="/app/whatsapp-conversations">
          {conversations.awaiting > 0 ? "clients qui attendent votre réponse" : "aucun client en attente"}
        </TodoCard>
      ) : (
        <div className={card}><p className="txt-compact-small text-ui-fg-subtle">Conversations en attente</p><Unavailable /></div>
      )}
    </div>
  )
}

const Figure = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div>
    <p className="txt-compact-small text-ui-fg-subtle">{label}</p>
    <p className="txt-large-plus text-ui-fg-base">{value}</p>
    {sub && <p className="txt-compact-small text-ui-fg-muted">{sub}</p>}
  </div>
)

const FiguresSection = ({ figures, month }: { figures: Dashboard["figures"]; month: string }) => {
  const { ordered, collected, cash, margin, courier_stock } = figures
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className={card}>
        <h3 className="txt-compact-medium-plus text-ui-fg-base mb-3">Aujourd'hui</h3>
        <div className="grid grid-cols-2 gap-3">
          {ordered.available ? <Figure label="Commandé" value={formatXof(ordered.today.amount)} sub={plural(ordered.today.count, "commande")} /> : <Unavailable />}
          {collected.available ? <Figure label="Encaissé" value={formatXof(collected.today)} /> : <Unavailable />}
        </div>
      </div>
      <div className={card}>
        <h3 className="txt-compact-medium-plus text-ui-fg-base mb-3">Ce mois ({monthLabel(month)})</h3>
        <div className="grid grid-cols-2 gap-3">
          {ordered.available ? <Figure label="Commandé" value={formatXof(ordered.month.amount)} sub={plural(ordered.month.count, "commande")} /> : <Unavailable />}
          {collected.available ? <Figure label="Encaissé" value={formatXof(collected.month)} /> : <Unavailable />}
        </div>
      </div>
      <a href="/app/cash" className={`${card} block hover:bg-ui-bg-base-hover`}>
        <h3 className="txt-compact-medium-plus text-ui-fg-base mb-3">Caisse</h3>
        {cash.available ? (
          <div className="grid grid-cols-3 gap-3">
            <Figure label="Solde" value={formatXof(cash.balance)} />
            <Figure label="Entrées du mois" value={formatXof(cash.month_in)} />
            <Figure label="Sorties du mois" value={formatXof(cash.month_out)} />
          </div>
        ) : (
          <Unavailable />
        )}
      </a>
      <a href="/app/procurement?tab=margins" className={`${card} block hover:bg-ui-bg-base-hover`}>
        <h3 className="txt-compact-medium-plus text-ui-fg-base mb-3">Marge brute du mois</h3>
        {margin.available ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Figure label="Marge" value={formatXof(margin.margin)} sub={plural(margin.orders, "commande encaissée")} />
              <Figure label="Ventes" value={formatXof(margin.revenue)} />
              <Figure label="Coût" value={formatXof(margin.cost)} />
            </div>
            {margin.unknown_cost_items > 0 && (
              <p className="txt-compact-small text-ui-fg-error mt-2">
                {plural(margin.unknown_cost_items, "article")} sans coût de revient : marge incomplète.
              </p>
            )}
          </>
        ) : (
          <Unavailable />
        )}
      </a>
      <a href="/app/deliveries?tab=stock" className={`${card} block hover:bg-ui-bg-base-hover`}>
        <h3 className="txt-compact-medium-plus text-ui-fg-base mb-3">Stock chez les livreurs</h3>
        {courier_stock.available ? (
          <>
            <Figure label="Articles confiés" value={String(courier_stock.total)} />
            {courier_stock.couriers.length > 0 && (
              <p className="txt-compact-small text-ui-fg-muted mt-1">
                {courier_stock.couriers.map((c) => `${c.name} : ${c.quantity}`).join(" · ")}
              </p>
            )}
          </>
        ) : (
          <Unavailable />
        )}
      </a>
    </div>
  )
}

const DashboardPage = () => {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api<Dashboard>("/admin/dashboard")
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="txt-xlarge-plus text-ui-fg-base">Tableau de bord</h1>
          {data && <p className="txt-compact-small text-ui-fg-subtle first-letter:uppercase">{dayLabel(data.today)}</p>}
        </div>
        <button type="button" className={secondaryButton} onClick={load} disabled={loading}>
          {loading ? "Actualisation…" : "Actualiser"}
        </button>
      </div>
      {error && (
        <div className={card}>
          <p className="txt-compact-small text-ui-fg-error">Impossible de charger le tableau de bord : {error}</p>
          <button type="button" className={`${secondaryButton} mt-2`} onClick={load}>Réessayer</button>
        </div>
      )}
      {!data && !error && <p className="txt-compact-small text-ui-fg-subtle">Chargement…</p>}
      {data && (
        <>
          <h2 className="txt-large-plus text-ui-fg-base">À faire aujourd'hui</h2>
          <TodoSection todo={data.todo} />
          <h2 className="txt-large-plus text-ui-fg-base mt-2">Chiffres</h2>
          <FiguresSection figures={data.figures} month={data.month} />
        </>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Tableau de bord",
  icon: ChartBar,
  rank: 0,
})

export default DashboardPage
```

Vérifier que l'icône existe : `ls node_modules/@medusajs/icons/dist/esm | grep -i chart-bar` (sinon `ChartPie`).

- [ ] **Step 2: Vérifier types et rendu en local**

Run: `cd apps/backend && npx tsc --noEmit -p . 2>&1 | grep -E "admin/routes/dashboard"` → aucune sortie.
Puis, backend local démarré : Playwright MCP sur `http://localhost:9000/app/dashboard` (admin de test), capture d'écran dans `.playwright-mcp/`. Expected : entrée « Tableau de bord » en tête du menu, les cinq lignes « À faire » et les cartes de chiffres ; un clic sur « Commandes à confier » ouvre l'onglet « À confier » des Livraisons. Contrôler la console (aucune erreur React).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/admin/routes/dashboard/page.tsx
git commit -m "feat(tableau-de-bord): page admin « Tableau de bord »"
```

---

### Task 5: Vérification réelle, déploiement, documentation

**Files:**
- Modify: `HANDOFF.md` (section « Dernière mise à jour »), `docs/HANDOFF-PROMPT.md` (état et tâches proposées)

- [ ] **Step 1: Revue finale** par un agent frais (superpowers:requesting-code-review) sur l'ensemble de la branche depuis `fc251ff` ; corriger ce qui est confirmé.

- [ ] **Step 2: Déployer sur staging** : `git push origin staging`, suivre le build (`curl -s "https://api.github.com/repos/Abdazz/Golden-Market/actions/runs?per_page=3"`, ~20 min).

- [ ] **Step 3: Non-régression sur staging** : relancer le script de la Task 2 Step 1 (`after-*.json`) et comparer avec `before-*.json` (`diff <(jq -S . before-x.json) <(jq -S . after-x.json)`). Expected : identiques (hors données modifiées entre-temps par l'activité réelle : dans ce cas, vérifier que les différences sont des données, pas des champs).

- [ ] **Step 4: Recouper `/admin/dashboard` sur staging** (même script, chemin `/admin/dashboard`) avec les pages détaillées : `to_assign.count` = longueur de `/admin/deliveries/to-assign` ; `figures.margin` = `month_margin` de `/admin/margins` ; `figures.cash.balance` = `balance` de `/admin/cash-entries` ; `figures.collected.month` = `summary.revenue` ; `todo.prospects.due` = longueur de `due` de `/admin/prospects` ; `todo.conversations.awaiting` = nombre de `awaitingReply` de `/admin/whatsapp-conversations`.

- [ ] **Step 5: Production** : `git push origin staging:main` (après la fin du build staging, jamais en même temps), même recoupement avec `MEDUSA_ADMIN_KEY_PRODUCTION` / `MEDUSA_BACKEND_URL_PRODUCTION`, puis ouvrir `/app/dashboard` en production (Playwright) et vérifier l'affichage.

- [ ] **Step 6: Documentation et commit** : ajouter une entrée datée dans `HANDOFF.md` (« Tableau de bord de gestion livré », spec, URL `/app/dashboard`), mettre à jour `docs/HANDOFF-PROMPT.md` (état ; retirer la tâche 1 des tâches proposées) et la mémoire `mini-saas-gestion-livreurs.md`.

```bash
git add HANDOFF.md docs/HANDOFF-PROMPT.md
git commit -m "docs(handoff): tableau de bord de gestion livré"
git push origin staging && git push origin staging:main
```
