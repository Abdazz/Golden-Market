# Finitions tableau de bord / frais d'expédition / commandes par téléphone - plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** corriger les défauts mineurs du tableau de bord, des frais d'expédition, des widgets produit et du formulaire « Nouvelle commande » (frais dans le total), et envoyer à Meta les commandes par téléphone avec `action_source: "phone_call"`.

**Architecture:** règles pures testées dans `src/lib/*`, abonné Medusa `order.canceled`, route admin `GET /admin/phone-orders/shipping-fee`, extensions admin en HTML natif (pas de `@medusajs/ui` : conflit de types React 18/19).

**Tech Stack:** Medusa v2.18, React 18 (extensions admin), Jest (`npm run test:unit` dans `apps/backend`).

**Spec:** `docs/superpowers/specs/2026-10-06-finitions-tableau-de-bord-frais-expedition-design.md`

## Global Constraints

- Code, commentaires, UI et commits en français ; pas d'emoji ; pas de trailer `Co-Authored-By`.
- Style : pas de point-virgule, guillemets doubles, indentation 2 espaces ; `@medusajs/eslint-plugin` sans règle désactivée.
- Pas de nouvelle table, colonne ni migration ; pas de composant `@medusajs/ui` dans l'admin.
- Commandes depuis `apps/backend` ; npm. Ne jamais toucher à la production, au VPS, à n8n ni aux `.env`.
- Textes exacts : « Indisponible » ; « Service injoignable, réessayez. » ; « Livraison : Gratuite (Ouagadougou) » ; « Livraison : <montant> » ; « Livraison : calcul… » ; « Livraison : calculée à la validation » ; frais par défaut **1 000 F**.

## Review Focus

- Ville saisie avec des variantes (« ouaga », « Ouagadougou », espaces) : gratuité décidée par `defaultTypeForCity`, comme à la création de la commande (aucune règle dupliquée côté formulaire).
- Formulaire « Nouvelle commande » : réponse de frais arrivant après un nouveau changement d'articles (réponse périmée) : seule la dernière demande est affichée.
- Commande annulée sans livraison, ou avec une livraison déjà « Livrée » : l'abonné ne change rien.
- Encadré « Frais d'expédition » : après une erreur réseau, un second clic réenregistre normalement.
- Tableau de bord sur téléphone (390 px) : aucun montant coupé dans les cartes Caisse et Marge.

---

### Task 1: Frais par défaut à 1 000 F

**Files:**
- Modify: `apps/backend/src/lib/shipping-fee-rules.ts` (constante + commentaire d'en-tête)
- Modify: `apps/backend/src/admin/widgets/product-shipping-fee.tsx` (`DEFAULT_FEE`, commentaire)
- Modify: `apps/backend/src/modules/golden-market-shipping.ts` (commentaires citant 1 500 F, s'il y en a)
- Test: `apps/backend/src/lib/__tests__/shipping-fee-rules.unit.spec.ts`, `apps/backend/src/modules/__tests__/golden-market-shipping.unit.spec.ts`, `apps/backend/src/lib/__tests__/product-fuzzy-search.unit.spec.ts`, `apps/backend/src/api/store/products-semantic-search/__tests__/route.unit.spec.ts`

**Interfaces:**
- Produces: `DEFAULT_SHIPPING_FEE_XOF = 1000`.

- [ ] **Step 1: Update tests first** : dans `shipping-fee-rules.unit.spec.ts`, le test « hors Ouagadougou : un produit sans frais saisis compte pour 1 500 F » devient « ... compte pour 1 000 F » ; garder un produit à 1 500 F explicite dans le panier n'est pas souhaité ici : remplacer `[petit, { metadata: null }]` par `[{ metadata: { frais_expedition_xof: 500 } }, { metadata: null }]` et attendre `1000`. Ajouter :

```ts
it("frais par défaut : 1 000 F", () => {
  expect(DEFAULT_SHIPPING_FEE_XOF).toBe(1000)
})
```

Dans `golden-market-shipping.unit.spec.ts` (« lecture des produits en échec ») : libellé « 1 000 F » et `toBe(1000)`. Dans `product-fuzzy-search.unit.spec.ts:83` et `products-semantic-search/__tests__/route.unit.spec.ts:106` : si la valeur attendue `1500` vient du défaut (produit sans `frais_expedition_xof`), attendre `1000` ; si elle vient d'une métadonnée explicite, ne rien changer (lire le jeu de données du test pour trancher).

- [ ] **Step 2: Run to verify failures**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/shipping-fee-rules.unit.spec.ts src/modules/__tests__/golden-market-shipping.unit.spec.ts src/lib/__tests__/product-fuzzy-search.unit.spec.ts src/api/store/products-semantic-search/__tests__/route.unit.spec.ts`
Expected: FAIL sur les valeurs par défaut.

- [ ] **Step 3: Implement** : `export const DEFAULT_SHIPPING_FEE_XOF = 1000` ; commentaire d'en-tête « 1 000 F pour un produit sans frais saisis » ; widget : `const DEFAULT_FEE = 1000` et commentaire « Vide : 1 000 F par défaut ». `grep -rn "1 500\|1500" apps/backend/src --include=*.ts --include=*.tsx` pour corriger tout commentaire ou texte restant qui décrit le défaut (pas les montants de test sans rapport).

- [ ] **Step 4: Run tests** (même commande) : PASS ; puis suite complète `npm run test:unit`.

- [ ] **Step 5: Commit**

```bash
git add -A apps/backend/src
git commit -m "feat(frais-expedition): frais par défaut à 1 000 F"
```

---

### Task 2: Livraisons des commandes annulées

**Files:**
- Modify: `apps/backend/src/lib/delivery-rules.ts` (nouvelle fonction `deliveriesToCancel`)
- Create: `apps/backend/src/subscribers/order-canceled-deliveries.ts`
- Test: `apps/backend/src/lib/__tests__/delivery-rules.unit.spec.ts`, `apps/backend/src/subscribers/__tests__/order-canceled-deliveries.unit.spec.ts`

**Interfaces:**
- Produces: `deliveriesToCancel(deliveries: { id: string; status: string }[]): { id: string; status: "canceled" }[]`.

- [ ] **Step 1: Write failing tests**

`delivery-rules.unit.spec.ts` :

```ts
describe("deliveriesToCancel", () => {
  it("annule seulement les livraisons confiées non terminées", () => {
    expect(
      deliveriesToCancel([
        { id: "d1", status: "assigned" },
        { id: "d2", status: "delivered" },
        { id: "d3", status: "failed" },
        { id: "d4", status: "canceled" },
      ])
    ).toEqual([{ id: "d1", status: "canceled" }])
  })
  it("aucune livraison : rien", () => {
    expect(deliveriesToCancel([])).toEqual([])
  })
})
```

`subscribers/__tests__/order-canceled-deliveries.unit.spec.ts` (modèle : les autres tests du dossier ; simuler le conteneur) :

```ts
import handler, { config } from "../order-canceled-deliveries"
import { updateDeliveryWorkflow } from "../../workflows/update-delivery"

jest.mock("../../workflows/update-delivery", () => ({ updateDeliveryWorkflow: jest.fn() }))

const makeContainer = (deliveries: { id: string; status: string }[]) => {
  const graph = jest.fn().mockResolvedValue({ data: deliveries })
  const logger = { error: jest.fn() }
  const container = { resolve: jest.fn((key: string) => (key === "logger" ? logger : { graph })) }
  return { container, graph, logger }
}

describe("order-canceled-deliveries", () => {
  const run = jest.fn().mockResolvedValue({ result: [] })
  beforeEach(() => {
    jest.clearAllMocks()
    ;(updateDeliveryWorkflow as unknown as jest.Mock).mockReturnValue({ run })
  })
  it("écoute order.canceled", () => {
    expect(config.event).toBe("order.canceled")
  })
  it("passe à « annulée » les livraisons confiées de la commande", async () => {
    const { container, graph } = makeContainer([{ id: "d1", status: "assigned" }, { id: "d2", status: "delivered" }])
    await handler({ event: { data: { id: "order_1" } }, container } as any)
    expect(graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "delivery", filters: { order_id: "order_1" } }))
    expect(run).toHaveBeenCalledWith({ input: [{ id: "d1", status: "canceled" }] })
  })
  it("rien à annuler : aucun workflow lancé", async () => {
    const { container } = makeContainer([{ id: "d2", status: "delivered" }])
    await handler({ event: { data: { id: "order_1" } }, container } as any)
    expect(run).not.toHaveBeenCalled()
  })
  it("échec : journalisé, jamais relancé", async () => {
    const { container, logger } = makeContainer([{ id: "d1", status: "assigned" }])
    run.mockRejectedValueOnce(new Error("base indisponible"))
    await expect(handler({ event: { data: { id: "order_1" } }, container } as any)).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalled()
  })
})
```

(Vérifier le nom d'entité réel des livraisons dans `query.graph` en lisant `src/api/admin/deliveries/tour/route.ts` ou `src/lib/dashboard-query.ts` : utiliser le même, et adapter le test si ce n'est pas `delivery`. Les clés de conteneur réelles sont `ContainerRegistrationKeys.QUERY` = `"query"` et `ContainerRegistrationKeys.LOGGER` = `"logger"`.)

- [ ] **Step 2: Run to verify failures**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/delivery-rules.unit.spec.ts src/subscribers/__tests__/order-canceled-deliveries.unit.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`delivery-rules.ts` :

```ts
// Commande annulée : ses livraisons confiées non terminées passent "Annulée".
export const deliveriesToCancel = (deliveries: { id: string; status: string }[]) =>
  deliveries.filter((d) => d.status === "assigned").map((d) => ({ id: d.id, status: "canceled" as const }))
```

`subscribers/order-canceled-deliveries.ts` :

```ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { deliveriesToCancel } from "../lib/delivery-rules"
import { updateDeliveryWorkflow } from "../workflows/update-delivery"

// Commande annulée -> ses livraisons confiées passent "Annulée" tout de suite
// (sinon elles restaient "en cours" au tableau de bord jusqu'à l'ouverture de
// la Tournée, qui garde ce contrôle en filet de sécurité). Jamais bloquant.
export default async function orderCanceledDeliveriesHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({ entity: "delivery", fields: ["id", "status"], filters: { order_id: event.data.id } })
    const changes = deliveriesToCancel(data)
    if (changes.length) await updateDeliveryWorkflow(container).run({ input: changes })
  } catch (error) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(`Livraisons de la commande ${event.data.id} non annulées (${(error as Error).message})`)
  }
}

export const config: SubscriberConfig = {
  event: "order.canceled",
}
```

- [ ] **Step 4: Run tests** (même commande) : PASS ; typecheck + lint des fichiers touchés.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/delivery-rules.ts apps/backend/src/lib/__tests__/delivery-rules.unit.spec.ts apps/backend/src/subscribers/order-canceled-deliveries.ts apps/backend/src/subscribers/__tests__/order-canceled-deliveries.unit.spec.ts
git commit -m "fix(livraisons): livraisons confiées annulées dès l'annulation de la commande"
```

---

### Task 3: Commandes par téléphone (test de la route, frais dans le total du formulaire)

**Files:**
- Create: `apps/backend/src/api/admin/phone-orders/__tests__/route.unit.spec.ts`
- Create: `apps/backend/src/api/admin/phone-orders/shipping-fee/route.ts`
- Create: `apps/backend/src/api/admin/phone-orders/shipping-fee/__tests__/route.unit.spec.ts`
- Modify: `apps/backend/src/admin/routes/phone-orders/new/page.tsx`

**Interfaces:**
- Consumes: `shippingFeeForVariants(query, city, variantIds)` (`src/lib/shipping-fee-query.ts`), `defaultTypeForCity` (`src/lib/delivery-rules.ts`).
- Produces: `GET /admin/phone-orders/shipping-fee?city=<ville>&variant_ids=<id1,id2>` -> `200 { amount: number }`.

- [ ] **Step 1: Test de la route POST existante** (`api/admin/phone-orders/__tests__/route.unit.spec.ts`) : caractérisation du comportement actuel, doit passer sans modifier la route. Simuler `@medusajs/medusa/core-flows` :

```ts
import { POST } from "../route"
import {
  convertDraftOrderWorkflow,
  createCustomersWorkflow,
  createOrUpdateOrderPaymentCollectionWorkflow,
  createOrderWorkflow,
} from "@medusajs/medusa/core-flows"

jest.mock("@medusajs/medusa/core-flows", () => ({
  convertDraftOrderWorkflow: jest.fn(),
  createCustomersWorkflow: jest.fn(),
  createOrUpdateOrderPaymentCollectionWorkflow: jest.fn(),
  createOrderWorkflow: jest.fn(),
}))

const runs = {
  customers: jest.fn().mockResolvedValue({ result: [{ id: "cus_new" }] }),
  order: jest.fn().mockResolvedValue({ result: { id: "order_1" } }),
  convert: jest.fn().mockResolvedValue({}),
  payment: jest.fn().mockResolvedValue({}),
}

const res = () => {
  const r: any = {}
  r.status = jest.fn(() => r)
  r.json = jest.fn(() => r)
  return r
}

const body = {
  phone: "70 00 00 00",
  first_name: "Awa",
  city: "Kaya",
  address: "Secteur 1",
  payment_method: "orange-money",
  items: [{ variant_id: "var_1", quantity: 1 }],
}

const scope = (opts: { existingCustomer?: boolean; fee?: number; noShipping?: boolean } = {}) => {
  const graph = jest.fn(async ({ entity }: any) => {
    if (entity === "region") return { data: [{ id: "reg_bf", currency_code: "xof", countries: [{ iso_2: "bf" }] }] }
    if (entity === "sales_channel") return { data: [{ id: "sc_1" }] }
    if (entity === "shipping_option") return { data: opts.noShipping ? [] : [{ id: "so_1", name: "Livraison", rules: [] }] }
    if (entity === "product_variant") return { data: [{ id: "var_1", product: { id: "p1", metadata: { frais_expedition_xof: opts.fee ?? 1000 } } }] }
    if (entity === "customer") return { data: opts.existingCustomer ? [{ id: "cus_old" }] : [] }
    if (entity === "order") return { data: [{ id: "order_1", display_id: 7, custom_display_id: "20261006001" }] }
    return { data: [] }
  })
  return { graph, req: (b: unknown) => ({ body: b, scope: { resolve: () => ({ graph }) } }) as any }
}

describe("POST /admin/phone-orders", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(createCustomersWorkflow as unknown as jest.Mock).mockReturnValue({ run: runs.customers })
    ;(createOrderWorkflow as unknown as jest.Mock).mockReturnValue({ run: runs.order })
    ;(convertDraftOrderWorkflow as unknown as jest.Mock).mockReturnValue({ run: runs.convert })
    ;(createOrUpdateOrderPaymentCollectionWorkflow as unknown as jest.Mock).mockReturnValue({ run: runs.payment })
  })

  it("requête invalide : 400 avec le message de validation", async () => {
    const r = res()
    await POST(scope().req({ ...body, phone: "" }), r)
    expect(r.status).toHaveBeenCalledWith(400)
    expect(r.json).toHaveBeenCalledWith({ message: expect.any(String) })
  })

  it("hors Ouagadougou : frais du produit transmis au brouillon, client créé", async () => {
    const r = res()
    await POST(scope({ fee: 1500 }).req(body), r)
    expect(runs.customers).toHaveBeenCalled()
    const draft = runs.order.mock.calls[0][0].input
    expect(JSON.stringify(draft)).toContain('"amount":1500')
    expect(r.json).toHaveBeenCalledWith({ order_id: "order_1", display_id: 7, order_number: "20261006001" })
  })

  it("Ouagadougou : livraison gratuite, client existant réutilisé", async () => {
    await POST(scope({ existingCustomer: true }).req({ ...body, city: "Ouagadougou" }), res())
    expect(runs.customers).not.toHaveBeenCalled()
    expect(JSON.stringify(runs.order.mock.calls[0][0].input)).toContain('"amount":0')
  })

  it("configuration incomplète : 500", async () => {
    const r = res()
    await POST(scope({ noShipping: true }).req(body), r)
    expect(r.status).toHaveBeenCalledWith(500)
  })
})
```

Adapter seulement ce que la lecture de `lib/phone-order.ts` (`parsePhoneOrderInput`, `buildDraftOrderInput`) impose (format du téléphone accepté, forme exacte du brouillon) ; la route ne change pas. Lancer : `npm run test:unit -- src/api/admin/phone-orders/__tests__/route.unit.spec.ts` -> PASS.

- [ ] **Step 2: Test qui échoue pour la route `shipping-fee`** (`api/admin/phone-orders/shipping-fee/__tests__/route.unit.spec.ts`) :

```ts
import { GET } from "../route"

const res = () => {
  const r: any = {}
  r.status = jest.fn(() => r)
  r.json = jest.fn(() => r)
  return r
}
const req = (q: Record<string, unknown>, metadata: Record<string, unknown> = { frais_expedition_xof: 1500 }) => {
  const graph = jest.fn().mockResolvedValue({ data: [{ id: "var_1", product: { id: "p1", metadata } }] })
  return { graph, request: { query: q, scope: { resolve: () => ({ graph }) } } as any }
}

describe("GET /admin/phone-orders/shipping-fee", () => {
  it("hors Ouagadougou : frais les plus élevés des produits", async () => {
    const { request } = req({ city: "Kaya", variant_ids: "var_1,var_2" })
    const r = res()
    await GET(request, r)
    expect(r.json).toHaveBeenCalledWith({ amount: 1500 })
  })
  it("Ouagadougou : 0 sans lire les produits", async () => {
    const { request, graph } = req({ city: "Ouagadougou", variant_ids: "var_1" })
    const r = res()
    await GET(request, r)
    expect(r.json).toHaveBeenCalledWith({ amount: 0 })
    expect(graph).not.toHaveBeenCalled()
  })
  it("aucun article : 0", async () => {
    const r = res()
    await GET(req({ city: "Kaya", variant_ids: "" }).request, r)
    expect(r.json).toHaveBeenCalledWith({ amount: 0 })
  })
})
```

Run: `npm run test:unit -- src/api/admin/phone-orders/shipping-fee/__tests__/route.unit.spec.ts` -> FAIL (route absente).

- [ ] **Step 3: Implement the route** (`api/admin/phone-orders/shipping-fee/route.ts`) :

```ts
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { shippingFeeForVariants } from "../../../../lib/shipping-fee-query"

// Frais d'expédition affichés dans le formulaire "Nouvelle commande" : même
// calcul qu'à la création de la commande (spec 2026-10-06).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const city = typeof req.query.city === "string" ? req.query.city : ""
  const raw = typeof req.query.variant_ids === "string" ? req.query.variant_ids : ""
  const variantIds = raw.split(",").map((id) => id.trim()).filter(Boolean)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  res.json({ amount: await shippingFeeForVariants(query, city, variantIds) })
}
```

Run le test : PASS.

- [ ] **Step 4: Formulaire** (`admin/routes/phone-orders/new/page.tsx`) :

```tsx
type Fee = { state: "idle" | "loading" | "ready" | "error"; amount: number }
const [fee, setFee] = useState<Fee>({ state: "idle", amount: 0 })

useEffect(() => {
  const ids = lines.map((l) => l.variant_id)
  if (!ids.length) {
    setFee({ state: "idle", amount: 0 })
    return
  }
  let stale = false
  setFee((f) => ({ ...f, state: "loading" }))
  const timer = window.setTimeout(() => {
    const params = new URLSearchParams({ city, variant_ids: ids.join(",") })
    fetch(`/admin/phone-orders/shipping-fee?${params}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => !stale && setFee({ state: "ready", amount: Number(data.amount) || 0 }))
      .catch(() => !stale && setFee({ state: "error", amount: 0 }))
  }, 300)
  return () => {
    stale = true
    window.clearTimeout(timer)
  }
}, [city, lines.map((l) => l.variant_id).join(",")])
```

(Si eslint `react-hooks/exhaustive-deps` signale la dépendance calculée, la sortir dans une constante `const variantKey = lines.map((l) => l.variant_id).join(",")` déclarée avant l'effet.)

Remplacer la ligne « Total » de la liste des articles par :

```tsx
<li className="txt-compact-small flex justify-end px-3 text-ui-fg-subtle">
  {fee.state === "loading"
    ? "Livraison : calcul…"
    : fee.state === "error"
      ? "Livraison : calculée à la validation"
      : fee.amount === 0
        ? "Livraison : Gratuite (Ouagadougou)"
        : `Livraison : ${formatXof(fee.amount)}`}
</li>
<li className="txt-compact-small-plus flex justify-end px-3">
  Total : {formatXof(total + (fee.state === "ready" ? fee.amount : 0))}
</li>
```

Note : `fee.amount === 0` en état `ready` signifie ville gratuite (les produits ont tous des frais > 0 ou le défaut 1 000 F).

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `cd apps/backend && npm run test:unit -- src/api/admin/phone-orders && npx tsc --noEmit -p . 2>&1 | grep -E "phone-orders" ; npx eslint src/api/admin/phone-orders src/admin/routes/phone-orders/new/page.tsx`
Expected: PASS, aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/api/admin/phone-orders apps/backend/src/admin/routes/phone-orders/new/page.tsx
git commit -m "feat(commandes-telephone): frais d'expédition affichés dans le total, route testée"
```

---

### Task 4: Tableau de bord et widgets produit

**Files:**
- Modify: `apps/backend/src/admin/routes/dashboard/page.tsx`
- Modify: `apps/backend/src/admin/widgets/product-shipping-fee.tsx`
- Modify: `apps/backend/src/admin/widgets/product-video.tsx`

Pas de logique testable unitairement (rendu) : vérification par typecheck, lint, et contrôle visuel par le contrôleur.

- [ ] **Step 1: Tableau de bord** : ajouter

```tsx
const UnavailableFigure = ({ label }: { label: string }) => (
  <div>
    <p className="txt-compact-small text-ui-fg-subtle">{label}</p>
    <p className="txt-compact-small text-ui-fg-muted">Indisponible</p>
  </div>
)
```

Dans `FiguresSection`, remplacer chaque `<Unavailable />` des cartes « Aujourd'hui » et « Ce mois » par `<UnavailableFigure label="Commandé" />` ou `<UnavailableFigure label="Encaissé" />` selon la position. Cartes Caisse et Marge : quand le bloc est indisponible, afficher la grille avec `UnavailableFigure` pour chaque libellé (Solde / Entrées du mois / Sorties du mois ; Marge / Ventes / Coût). Les cartes « À faire » et « Stock chez les livreurs » gardent `Unavailable` (une seule valeur, libellé déjà en titre). Remplacer les deux `grid grid-cols-3 gap-3` par `grid grid-cols-1 gap-3 sm:grid-cols-3`.

- [ ] **Step 2: Encadré frais d'expédition** : dans `save()`, entourer le `fetch` d'un `try/catch` :

```tsx
    let res: Response
    try {
      res = await fetch(`/admin/products/${product.id}`, { /* options inchangées */ })
    } catch {
      setStatus("error")
      setMessage("Service injoignable, réessayez.")
      return
    }
```

Le bouton est réactivé puisque `status` n'est plus `saving`.

- [ ] **Step 3: Widget vidéo** : dans `saveVideoUrl`, même `try/catch` autour du `fetch` avec `setStatus("error")` et `setErrorMessage("Service injoignable, réessayez.")`. Pour « Retirer », remplacer `delete nextMetadata.video_url` par `nextMetadata.video_url = ""` avec le commentaire : « Medusa fusionne les métadonnées : une clé absente reste en place, une chaîne vide la supprime. » Après succès, si `newVideoUrl` est nul, retirer `video_url` de la copie locale de `product.metadata` (comme `product-shipping-fee.tsx`). La lecture initiale traite une chaîne vide comme « pas de vidéo » : `typeof v === "string" && v.trim() !== "" ? v : null`. Vérifier aussi le `try/catch` du téléversement (`/admin/uploads`) : s'il n'en a pas, ajouter le même message.

- [ ] **Step 4: Typecheck, lint**

Run: `cd apps/backend && npx tsc --noEmit -p . 2>&1 | grep -E "dashboard/page|product-shipping-fee|product-video" ; npx eslint src/admin/routes/dashboard/page.tsx src/admin/widgets/product-shipping-fee.tsx src/admin/widgets/product-video.tsx`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/admin/routes/dashboard/page.tsx apps/backend/src/admin/widgets/product-shipping-fee.tsx apps/backend/src/admin/widgets/product-video.tsx
git commit -m "fix(admin): chiffres indisponibles libellés, cartes lisibles sur téléphone, erreurs réseau et retrait de vidéo"
```

---

### Task 5: Suivi Meta des commandes par téléphone (action_source)

**Files:**
- Modify: `apps/backend/src/lib/meta-conversions-mapping.ts`
- Modify: `apps/backend/src/subscribers/order-placed-meta-conversions-api.ts`
- Test: `apps/backend/src/lib/__tests__/meta-conversions-mapping.unit.spec.ts`, `apps/backend/src/subscribers/__tests__/order-placed-meta-conversions-api.unit.spec.ts`

**Interfaces:**
- Produces: `type MetaActionSource = "website" | "phone_call"` ; `actionSourceFor(metadata: Record<string, unknown> | null | undefined): MetaActionSource` ; `OrderForMetaConversion` reçoit `metadata?: Record<string, unknown> | null`.

- [ ] **Step 1: Failing tests** (mapping) :

```ts
describe("actionSourceFor", () => {
  it("commande saisie par téléphone : phone_call", () => {
    expect(actionSourceFor({ source: "telephone" })).toBe("phone_call")
  })
  it("site, agent WhatsApp ou métadonnées absentes : website", () => {
    expect(actionSourceFor({ source: "whatsapp" })).toBe("website")
    expect(actionSourceFor(null)).toBe("website")
    expect(actionSourceFor(undefined)).toBe("website")
  })
})

it("buildPurchaseEvent : action_source phone_call pour une commande par téléphone", () => {
  const event = buildPurchaseEvent({ ...order, metadata: { source: "telephone" } }, 1700000000)
  expect(event.action_source).toBe("phone_call")
})
```

(le dernier `it` va dans le `describe("buildPurchaseEvent")` existant, qui définit `order`). Abonné : dans le test « demande les articles et la livraison en entier... », ajouter l'attente que `fields` contienne `"metadata"` :

```ts
expect(graph.mock.calls[0][0].fields).toEqual(expect.arrayContaining(["metadata"]))
```

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/meta-conversions-mapping.unit.spec.ts src/subscribers/__tests__/order-placed-meta-conversions-api.unit.spec.ts` -> FAIL.

- [ ] **Step 2: Implement** :

```ts
export type MetaActionSource = "website" | "phone_call"

// Commande saisie dans l'admin (bouton "Nouvelle commande") : vente conclue
// par téléphone, sans pixel navigateur. Site et agent WhatsApp : "website".
export const actionSourceFor = (metadata: Record<string, unknown> | null | undefined): MetaActionSource =>
  metadata?.source === "telephone" ? "phone_call" : "website"
```

`MetaConversionEvent.action_source: MetaActionSource` ; `OrderForMetaConversion.metadata?: Record<string, unknown> | null` ; dans `buildPurchaseEvent` : `action_source: actionSourceFor(order.metadata)`. Abonné : ajouter `"metadata"` aux `fields`. Mettre à jour le commentaire d'en-tête de l'abonné (le pixel ne déduplique que les commandes du site).

- [ ] **Step 3: Run tests** (même commande) : PASS ; typecheck + lint des fichiers.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/lib/meta-conversions-mapping.ts apps/backend/src/lib/__tests__/meta-conversions-mapping.unit.spec.ts apps/backend/src/subscribers/order-placed-meta-conversions-api.ts apps/backend/src/subscribers/__tests__/order-placed-meta-conversions-api.unit.spec.ts
git commit -m "feat(meta): commandes par téléphone envoyées avec action_source phone_call"
```

---

### Task 6 (contrôleur) : documentation, n8n, vérification, déploiement

- [ ] `AGENTS.md`, `docs/HANDOFF-PROMPT.md`, guide n8n (`../n8n_automation/guide-golden-market-agent.md`) : défaut 1 000 F ; consigne de l'agent (workflow `i6KGA9BvK9unjxxj`) : remplacer toute mention du défaut à 1 500 F.
- [ ] Production : vérifier qu'aucune livraison `assigned` n'a de commande annulée (sinon ouvrir la Tournée ou les annuler par l'API).
- [ ] Local : tableau de bord bureau et téléphone ; formulaire Kaya / Ouagadougou ; encadré et widget vidéo réseau coupé ; annulation d'une commande confiée.
- [ ] Revue finale, staging, production.
