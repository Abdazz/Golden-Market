# Frais d'expédition par produit — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** les frais d'expédition hors Ouagadougou, saisis par produit dans l'admin, sont calculés automatiquement par Medusa et inclus dans le total de toute commande (site, agent WhatsApp, téléphone).

**Architecture:** règle pure (`lib/shipping-fee-rules.ts`) ; fournisseur de livraison Medusa `golden-market-shipping` dont `calculatePrice` applique la règle ; script one-shot qui remplace l'option fixe à 0 F par une option calculée ; la route téléphone et les trois routes de recherche produit réutilisent la règle ; widget admin pour saisir `metadata.frais_expedition_xof` ; n8n affiche les frais aux clients.

**Tech Stack:** Medusa v2.18 (module provider fulfillment, `createShippingOptionsWorkflow`, Query), Jest (`test:unit`), React (widget admin), n8n (CLI sur le VPS).

**Spec:** `docs/superpowers/specs/2026-10-04-frais-expedition-par-produit-design.md`

## Global Constraints

- Code, commentaires, UI, commits en français ; pas d'emoji dans le code ; pas de trailer Co-Authored-By.
- Métadonnée produit : `frais_expedition_xof` (entier ≥ 0, F CFA). Défaut : `DEFAULT_SHIPPING_FEE_XOF = 1500`.
- Ouagadougou = `defaultTypeForCity(city) === "express"` (`lib/delivery-rules.ts`) → 0 F.
- Plusieurs produits : le maximum des frais (quantité ignorée).
- Identifiant du fournisseur : `golden-market-shipping` ; id de fournisseur Medusa résultant : `golden-market-shipping_golden-market-shipping`.
- Prix Medusa stockés tels quels (1500 = 1 500 F, jamais × 100).
- Tests : `cd apps/backend && npm run test:unit -- <chemin>` ; build : `cd apps/backend && npm run build`.
- Aucune commande réelle passée en production pendant les tests ; n8n pointe sur la production (`MEDUSA_ENV=production`) : patcher n8n seulement après le déploiement production du backend et le script.

## Review Focus

1. Ville saisie « Ouaga 2000 », « OUAGADOUGOU », « ouagadougou » avec espaces → 0 F ; « Koudougou » → frais. Testé Task 1.
2. Métadonnée saisie en chaîne (`"2000"`), négative, décimale ou texte → valeur par défaut 1 500 F, jamais d'erreur ni de `NaN` dans un total. Testé Task 1.
3. Lecture des produits en échec dans le fournisseur (base lente) → 1 500 F hors Ouagadougou, la commande passe. Testé Task 2.
4. Panier dont la ville n'est pas encore saisie (site, avant l'étape adresse) → 0 F, pas d'erreur. Testé Task 1 (ville vide = Ouagadougou, comme la règle des livraisons) et Task 2.
5. Le widget ne doit effacer aucune autre métadonnée du produit (`video_url` de la vidéo Meta). Vérifié Task 6 (code et contrôle manuel en local).

---

### Task 1: Règle de calcul

**Files:**
- Create: `apps/backend/src/lib/shipping-fee-rules.ts`
- Test: `apps/backend/src/lib/__tests__/shipping-fee-rules.unit.spec.ts`

**Interfaces:**
- Consumes: `defaultTypeForCity(city: string | null | undefined): "express" | "expedition"` (`lib/delivery-rules`).
- Produces:
  - `DEFAULT_SHIPPING_FEE_XOF = 1500`
  - `SHIPPING_FEE_METADATA_KEY = "frais_expedition_xof"`
  - `productShippingFee(metadata: Record<string, unknown> | null | undefined): number`
  - `computeShippingFee(input: { city: string | null | undefined; products: { metadata?: Record<string, unknown> | null }[] }): number`

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
import { DEFAULT_SHIPPING_FEE_XOF, computeShippingFee, productShippingFee } from "../shipping-fee-rules"

describe("productShippingFee", () => {
  it.each([
    [{ frais_expedition_xof: 2000 }, 2000],
    [{ frais_expedition_xof: "2500" }, 2500],
    [{ frais_expedition_xof: 0 }, 0],
    [{ frais_expedition_xof: -100 }, DEFAULT_SHIPPING_FEE_XOF],
    [{ frais_expedition_xof: 1500.5 }, DEFAULT_SHIPPING_FEE_XOF],
    [{ frais_expedition_xof: "abc" }, DEFAULT_SHIPPING_FEE_XOF],
    [{ frais_expedition_xof: "" }, DEFAULT_SHIPPING_FEE_XOF],
    [{}, DEFAULT_SHIPPING_FEE_XOF],
    [null, DEFAULT_SHIPPING_FEE_XOF],
  ])("%j -> %i", (metadata, expected) => {
    expect(productShippingFee(metadata as any)).toBe(expected)
  })
})

describe("computeShippingFee", () => {
  const balai = { metadata: { frais_expedition_xof: 1500 } }
  const ventilo = { metadata: { frais_expedition_xof: 2500 } }
  const petit = { metadata: { frais_expedition_xof: 500 } }

  it.each(["Ouagadougou", "ouaga 2000", "  OUAGADOUGOU ", "", null, undefined])(
    "livraison gratuite à Ouagadougou (%p)",
    (city) => expect(computeShippingFee({ city: city as any, products: [ventilo] })).toBe(0)
  )

  it("hors Ouagadougou : les frais les plus élevés des produits du panier", () => {
    expect(computeShippingFee({ city: "Kaya", products: [balai, ventilo, petit] })).toBe(2500)
  })

  it("hors Ouagadougou : un produit sans frais saisis compte pour 1 500 F", () => {
    expect(computeShippingFee({ city: "Koudougou", products: [petit, { metadata: null }] })).toBe(1500)
  })

  it("panier vide : 0 F", () => {
    expect(computeShippingFee({ city: "Kaya", products: [] })).toBe(0)
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/shipping-fee-rules.unit.spec.ts`
Expected: FAIL « Cannot find module '../shipping-fee-rules' ».

- [ ] **Step 3: Implémenter**

```ts
import { defaultTypeForCity } from "./delivery-rules"

// Frais d'expédition (spec 2026-10-04 frais-expedition-par-produit) :
// gratuits à Ouagadougou ; ailleurs, un seul colis -> les frais les plus
// élevés des produits du panier, 1 500 F pour un produit sans frais saisis.

export const DEFAULT_SHIPPING_FEE_XOF = 1500
export const SHIPPING_FEE_METADATA_KEY = "frais_expedition_xof"

export const productShippingFee = (metadata: Record<string, unknown> | null | undefined): number => {
  const raw = metadata?.[SHIPPING_FEE_METADATA_KEY]
  const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_SHIPPING_FEE_XOF
}

export const computeShippingFee = (input: {
  city: string | null | undefined
  products: { metadata?: Record<string, unknown> | null }[]
}): number => {
  if (defaultTypeForCity(input.city) === "express" || !input.products.length) return 0
  return Math.max(...input.products.map((p) => productShippingFee(p.metadata)))
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/shipping-fee-rules.unit.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/shipping-fee-rules.ts apps/backend/src/lib/__tests__/shipping-fee-rules.unit.spec.ts
git commit -m "feat(livraison): règle des frais d'expédition par produit"
```

---

### Task 2: Lecture des produits et fournisseur de livraison `golden-market-shipping`

**Files:**
- Create: `apps/backend/src/lib/shipping-fee-query.ts`
- Create: `apps/backend/src/modules/golden-market-shipping.ts`
- Modify: `apps/backend/medusa-config.ts` (ajout du module fulfillment)
- Test: `apps/backend/src/lib/__tests__/shipping-fee-query.unit.spec.ts`, `apps/backend/src/modules/__tests__/golden-market-shipping.unit.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`computeShippingFee`, `DEFAULT_SHIPPING_FEE_XOF`).
- Produces:
  - `shippingFeeForProducts(query: { graph: Function }, city: string | null | undefined, productIds: string[]): Promise<number>`
  - `shippingFeeForVariants(query, city, variantIds: string[]): Promise<number>` (utilisée par la route téléphone, Task 4)
  - classe `GoldenMarketShippingService` (identifier `golden-market-shipping`), propriété `resolveQuery: () => { graph: Function }` remplaçable en test.

- [ ] **Step 1: Tests qui échouent — lecture**

`src/lib/__tests__/shipping-fee-query.unit.spec.ts` :

```ts
import { shippingFeeForProducts, shippingFeeForVariants } from "../shipping-fee-query"

const queryWith = (data: any[]) => ({ graph: jest.fn().mockResolvedValue({ data }) })

describe("shippingFeeForProducts", () => {
  it("lit les métadonnées des produits et applique la règle", async () => {
    const query = queryWith([
      { id: "p1", metadata: { frais_expedition_xof: 1500 } },
      { id: "p2", metadata: { frais_expedition_xof: 2500 } },
    ])
    await expect(shippingFeeForProducts(query, "Kaya", ["p1", "p2", "p1"])).resolves.toBe(2500)
    expect(query.graph).toHaveBeenCalledWith({ entity: "product", fields: ["id", "metadata"], filters: { id: ["p1", "p2"] } })
  })

  it("ne lit rien à Ouagadougou ni pour un panier vide", async () => {
    const query = queryWith([])
    await expect(shippingFeeForProducts(query, "Ouagadougou", ["p1"])).resolves.toBe(0)
    await expect(shippingFeeForProducts(query, "Kaya", [])).resolves.toBe(0)
    expect(query.graph).not.toHaveBeenCalled()
  })
})

describe("shippingFeeForVariants", () => {
  it("passe par le produit de chaque variante", async () => {
    const query = queryWith([
      { id: "v1", product: { id: "p1", metadata: { frais_expedition_xof: 3000 } } },
      { id: "v2", product: { id: "p2", metadata: {} } },
    ])
    await expect(shippingFeeForVariants(query, "Bobo-Dioulasso", ["v1", "v2"])).resolves.toBe(3000)
    expect(query.graph).toHaveBeenCalledWith({ entity: "product_variant", fields: ["id", "product.id", "product.metadata"], filters: { id: ["v1", "v2"] } })
  })
})
```

- [ ] **Step 2: Tests qui échouent — fournisseur**

`src/modules/__tests__/golden-market-shipping.unit.spec.ts` :

```ts
import { GoldenMarketShippingService } from "../golden-market-shipping"

const serviceWith = (graph: jest.Mock) => {
  const service = new GoldenMarketShippingService({}, {})
  service.resolveQuery = () => ({ graph })
  return service
}

const context = (city: string | null, productIds: string[]) =>
  ({ shipping_address: city === null ? null : { city }, items: productIds.map((id) => ({ product_id: id })) }) as any

describe("GoldenMarketShippingService", () => {
  it("sait calculer ses prix", async () => {
    await expect(new GoldenMarketShippingService({}, {}).canCalculate({} as any)).resolves.toBe(true)
  })

  it("calcule les frais d'expédition du panier", async () => {
    const graph = jest.fn().mockResolvedValue({ data: [{ id: "p1", metadata: { frais_expedition_xof: 2000 } }] })
    const price = await serviceWith(graph).calculatePrice({}, {}, context("Kaya", ["p1"]))
    expect(price).toEqual({ calculated_amount: 2000, is_calculated_price_tax_inclusive: true })
  })

  it("0 F tant que l'adresse n'est pas saisie", async () => {
    const graph = jest.fn()
    const price = await serviceWith(graph).calculatePrice({}, {}, context(null, ["p1"]))
    expect(price.calculated_amount).toBe(0)
  })

  it("lecture des produits en échec : 1 500 F hors Ouagadougou, sans bloquer la commande", async () => {
    const graph = jest.fn().mockRejectedValue(new Error("timeout"))
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    const price = await serviceWith(graph).calculatePrice({}, {}, context("Kaya", ["p1"]))
    expect(price.calculated_amount).toBe(1500)
    spy.mockRestore()
  })

  it("expose une option de livraison et accepte les données telles quelles", async () => {
    const service = new GoldenMarketShippingService({}, {})
    await expect(service.getFulfillmentOptions()).resolves.toEqual([{ id: "golden-market-shipping" }])
    await expect(service.validateFulfillmentData({}, { a: 1 }, {} as any)).resolves.toEqual({ a: 1 })
  })
})
```

- [ ] **Step 3: Vérifier l'échec**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/shipping-fee-query.unit.spec.ts src/modules/__tests__/golden-market-shipping.unit.spec.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 4: Implémenter la lecture**

`src/lib/shipping-fee-query.ts` :

```ts
import { computeShippingFee } from "./shipping-fee-rules"
import { defaultTypeForCity } from "./delivery-rules"

// Lecture des frais d'expédition des produits d'un panier / d'une commande
// (spec 2026-10-04 frais-expedition-par-produit).
type GraphQuery = { graph: (config: any) => Promise<{ data: any[] }> }

export async function shippingFeeForProducts(query: GraphQuery, city: string | null | undefined, productIds: string[]) {
  const ids = [...new Set(productIds.filter(Boolean))]
  if (!ids.length || defaultTypeForCity(city) === "express") return 0
  const { data } = await query.graph({ entity: "product", fields: ["id", "metadata"], filters: { id: ids } })
  return computeShippingFee({ city, products: data })
}

export async function shippingFeeForVariants(query: GraphQuery, city: string | null | undefined, variantIds: string[]) {
  const ids = [...new Set(variantIds.filter(Boolean))]
  if (!ids.length || defaultTypeForCity(city) === "express") return 0
  const { data } = await query.graph({ entity: "product_variant", fields: ["id", "product.id", "product.metadata"], filters: { id: ids } })
  return computeShippingFee({ city, products: data.map((v: any) => v.product ?? {}) })
}
```

- [ ] **Step 5: Implémenter le fournisseur**

`src/modules/golden-market-shipping.ts` :

```ts
import { container } from "@medusajs/framework"
import {
  AbstractFulfillmentProviderService,
  ContainerRegistrationKeys,
  ModuleProvider,
  Modules,
} from "@medusajs/framework/utils"
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CreateFulfillmentResult,
  FulfillmentOption,
} from "@medusajs/framework/types"
import { DEFAULT_SHIPPING_FEE_XOF } from "../lib/shipping-fee-rules"
import { defaultTypeForCity } from "../lib/delivery-rules"
import { shippingFeeForProducts } from "../lib/shipping-fee-query"

/**
 * Livraison Golden Market (spec 2026-10-04 frais-expedition-par-produit) :
 * option "calculée" - gratuite à Ouagadougou, ailleurs les frais d'expédition
 * les plus élevés des produits du panier (metadata.frais_expedition_xof,
 * 1 500 F par défaut). Aucun service externe : expédition gérée à la main,
 * comme le fournisseur "manual" de Medusa.
 *
 * Le conteneur d'un fournisseur ne donne accès qu'au module fulfillment :
 * les produits sont lus par Query depuis le conteneur global de l'application.
 */
export class GoldenMarketShippingService extends AbstractFulfillmentProviderService {
  static identifier = "golden-market-shipping"

  resolveQuery: () => { graph: (config: any) => Promise<{ data: any[] }> } = () =>
    container.resolve(ContainerRegistrationKeys.QUERY)

  constructor(_container: any, _options: Record<string, unknown>) {
    super()
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [{ id: "golden-market-shipping" }]
  }

  async validateFulfillmentData(_optionData: Record<string, unknown>, data: Record<string, unknown>, _context: any) {
    return data
  }

  async validateOption(_data: Record<string, unknown>): Promise<boolean> {
    return true
  }

  async canCalculate(_data: any): Promise<boolean> {
    return true
  }

  async calculatePrice(
    _optionData: CalculateShippingOptionPriceDTO["optionData"],
    _data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    const city = (context as any)?.shipping_address?.city ?? null
    const productIds = (((context as any)?.items ?? []) as any[]).map((i) => i.product_id ?? i.product?.id ?? i.variant?.product?.id)
    let amount: number
    try {
      amount = await shippingFeeForProducts(this.resolveQuery(), city, productIds)
    } catch (error) {
      // Ne jamais bloquer une commande pour ça : montant par défaut hors Ouagadougou.
      console.error("[golden-market-shipping] lecture des frais d'expédition impossible :", error)
      amount = defaultTypeForCity(city) === "express" || !productIds.length ? 0 : DEFAULT_SHIPPING_FEE_XOF
    }
    return { calculated_amount: amount, is_calculated_price_tax_inclusive: true }
  }

  async createFulfillment(): Promise<CreateFulfillmentResult> {
    return { data: {}, labels: [] }
  }

  async cancelFulfillment(): Promise<any> {
    return {}
  }

  async createReturnFulfillment(): Promise<CreateFulfillmentResult> {
    return { data: {}, labels: [] }
  }
}

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [GoldenMarketShippingService],
})
```

Si `tsc` signale un type absent de `@medusajs/framework/types` (`CreateFulfillmentResult`, `FulfillmentOption`), le remplacer par le type de retour de la méthode correspondante dans `node_modules/@medusajs/types/dist/fulfillment/provider.d.ts` (ne pas mettre `any` sur `calculatePrice`).

- [ ] **Step 6: Enregistrer le module dans `medusa-config.ts`**

Dans `modules`, après le bloc `payment` :

```ts
    // Livraison : fournisseur manuel de Medusa (conservé pour les anciennes
    // commandes) + fournisseur Golden Market à prix calculé (frais
    // d'expédition par produit, spec 2026-10-04 frais-expedition-par-produit).
    fulfillment: {
      resolve: '@medusajs/medusa/fulfillment',
      options: {
        providers: [
          { resolve: '@medusajs/medusa/fulfillment-manual', id: 'manual' },
          { resolve: './src/modules/golden-market-shipping', id: 'golden-market-shipping' },
        ],
      },
    },
```

Respecter la forme du fichier (objet `modules` ou tableau) : regarder comment `payment` est déclaré et faire de même.

- [ ] **Step 7: Vérifier**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/shipping-fee-query.unit.spec.ts src/modules/__tests__/golden-market-shipping.unit.spec.ts && npm run build`
Expected: PASS ; build sans erreur.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/lib/shipping-fee-query.ts apps/backend/src/modules/golden-market-shipping.ts apps/backend/src/lib/__tests__/shipping-fee-query.unit.spec.ts apps/backend/src/modules/__tests__/golden-market-shipping.unit.spec.ts apps/backend/medusa-config.ts
git commit -m "feat(livraison): fournisseur de livraison à frais d'expédition calculés"
```

---

### Task 3: Script de bascule vers l'option calculée

**Files:**
- Create: `apps/backend/src/scripts/setup-calculated-shipping.ts`
- Modify: `apps/backend/package.json` (script `setup:calculated-shipping`), `AGENTS.md` (section catalogue / scripts one-shot)

**Interfaces:**
- Consumes: fournisseur `golden-market-shipping_golden-market-shipping` (Task 2).
- Produces: une seule option de livraison non-retour, « Livraison », `price_type: calculated`.

- [ ] **Step 1: Écrire le script**

```ts
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createShippingOptionsWorkflow, deleteShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"

// One-shot idempotent (spec 2026-10-04 frais-expedition-par-produit) :
// remplace l'option "Livraison — à convenir avec le marchand" (0 F fixe) par
// l'option "Livraison" à prix calculé (fournisseur golden-market-shipping).
// Les commandes passées gardent leur mode de livraison.
const PROVIDER_ID = "golden-market-shipping_golden-market-shipping"

export default async function setupCalculatedShipping({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)

  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "fulfillment_providers.id", "fulfillment_sets.service_zones.id"],
  })
  const location = locations[0]
  const serviceZoneId = location?.fulfillment_sets?.[0]?.service_zones?.[0]?.id
  if (!location || !serviceZoneId) throw new Error("Emplacement de stock ou zone de service introuvable (lancer seed:region-bf d'abord).")

  if (!(location.fulfillment_providers ?? []).some((p: any) => p?.id === PROVIDER_ID)) {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: PROVIDER_ID },
    })
    logger.info("Fournisseur golden-market-shipping relié à l'emplacement de stock.")
  }

  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "provider_id", "price_type", "shipping_profile_id", "rules.attribute", "rules.value"],
  })
  const isReturn = (o: any) => (o.rules ?? []).some((r: any) => r.attribute === "is_return" && r.value === "true")
  const outbound = options.filter((o: any) => !isReturn(o))

  if (!outbound.some((o: any) => o.provider_id === PROVIDER_ID)) {
    const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id"] })
    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: "Livraison",
          price_type: "calculated",
          provider_id: PROVIDER_ID,
          service_zone_id: serviceZoneId,
          shipping_profile_id: outbound[0]?.shipping_profile_id ?? profiles[0].id,
          type: {
            label: "Livraison",
            description: "Gratuite à Ouagadougou ; ailleurs, frais d'expédition selon les produits.",
            code: "livraison",
          },
          data: { id: "golden-market-shipping" },
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        } as any,
      ],
    })
    logger.info("Option de livraison calculée créée.")
  }

  const obsolete = outbound.filter((o: any) => o.provider_id !== PROVIDER_ID).map((o: any) => o.id)
  if (obsolete.length) {
    await deleteShippingOptionsWorkflow(container).run({ input: { ids: obsolete } })
    logger.info(`Option(s) de livraison à prix fixe supprimée(s) : ${obsolete.length}.`)
  }
  logger.info("Livraison à frais d'expédition calculés : prête.")
}
```

- [ ] **Step 2: Ajouter le script npm**

Dans `apps/backend/package.json`, après `search:backfill-embeddings` :

```json
    "setup:calculated-shipping": "test -f ./src/scripts/setup-calculated-shipping.ts && medusa exec ./src/scripts/setup-calculated-shipping.ts || medusa exec ./src/scripts/setup-calculated-shipping.js",
```

- [ ] **Step 3: Exécuter en local et vérifier**

Postgres local démarré (port 5433). Run : `cd apps/backend && npm run setup:calculated-shipping`, deux fois.
Expected : premier passage « relié… / créée / supprimée(s) : 1 / prête » ; second passage seulement « prête » (idempotent).
Puis, backend local démarré (`npx medusa develop` dans `apps/backend`) : créer un panier par l'API store (région BF, clé publique locale), ajouter une variante, adresse `city: "Kaya"`, `GET /store/shipping-options?cart_id=…` → une seule option `price_type: "calculated"` ; `POST /store/shipping-options/<id>/calculate` `{ cart_id }` → `amount` = 1 500 (ou la valeur de la métadonnée) ; même chose avec `city: "Ouagadougou"` → 0. Ajouter la méthode (`POST /store/carts/<id>/shipping-methods`) et vérifier `cart.shipping_total` et `cart.total`.

- [ ] **Step 4: Documenter dans `AGENTS.md`**

Après la section « Recherche sémantique produits », ajouter :

```markdown
### Frais d'expédition par produit (one-shot, idempotent)

```bash
cd apps/backend
<pm> run setup:calculated-shipping   # remplace l'option de livraison à 0 F par l'option calculée (fournisseur golden-market-shipping)
```

À lancer une fois par environnement **après** le déploiement du backend qui enregistre le fournisseur
`golden-market-shipping` (`medusa-config.ts`). Frais : gratuits à Ouagadougou ; ailleurs, le
maximum de `product.metadata.frais_expedition_xof` des produits du panier (1 500 F par défaut),
saisi dans l'encadré « Frais d'expédition » de la fiche produit. Voir
`docs/superpowers/specs/2026-10-04-frais-expedition-par-produit-design.md`.
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/scripts/setup-calculated-shipping.ts apps/backend/package.json AGENTS.md
git commit -m "feat(livraison): script de bascule vers l'option de livraison calculée"
```

---

### Task 4: Commandes par téléphone

**Files:**
- Modify: `apps/backend/src/api/admin/phone-orders/route.ts:31-68`

**Interfaces:**
- Consumes: `shippingFeeForVariants(query, city, variantIds)` (Task 2).

- [ ] **Step 1: Remplacer le prix fixe par le calcul**

Dans la route, la requête des options ne demande plus les prix ; remplacer le bloc `const shippingAmount = ...` par :

```ts
  // Frais d'expédition calculés comme pour le site et l'agent WhatsApp
  // (spec 2026-10-04 frais-expedition-par-produit).
  const shippingAmount = await shippingFeeForVariants(
    query,
    input.city,
    input.items.map((item) => item.variant_id)
  )
```

et passer `amount: shippingAmount` à `shippingOption`. Mettre à jour le commentaire « un seul mode de livraison ("à convenir") » en « un seul mode de livraison (« Livraison », prix calculé) ». Ajouter l'import `import { shippingFeeForVariants } from "../../../lib/shipping-fee-query"`. Retirer `prices.amount`, `prices.currency_code` des champs demandés.

- [ ] **Step 2: Vérifier**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/phone-order.unit.spec.ts && npm run build`
Expected: PASS ; build OK. En local (après Task 3), bouton « Nouvelle commande » de l'admin avec ville « Kaya » : la commande créée a `shipping_total` = frais attendus, et 0 avec « Ouagadougou ».

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/api/admin/phone-orders/route.ts
git commit -m "feat(livraison): frais d'expédition calculés pour les commandes par téléphone"
```

---

### Task 5: Frais d'expédition dans les recherches produit de l'agent

**Files:**
- Modify: `apps/backend/src/lib/product-fuzzy-search.ts` (`FUZZY_SEARCH_FIELDS`, `fetchProductsWithAvailability`)
- Modify: `apps/backend/src/api/store/products-semantic-search/route.ts` (`SEARCH_FIELDS`, type `SearchProduct`, boucle de disponibilité)
- Test: `apps/backend/src/lib/__tests__/product-fuzzy-search.unit.spec.ts`, `apps/backend/src/api/store/products-semantic-search/__tests__/route.unit.spec.ts`

**Interfaces:**
- Consumes: `productShippingFee` (Task 1).
- Produces: chaque produit renvoyé par `/store/products-fuzzy-search`, `/store/products-catalog`, `/store/products-semantic-search` porte `shipping_fee_xof: number` (frais hors Ouagadougou), et **pas** `metadata` (route publique : ne pas exposer les métadonnées internes).

- [ ] **Step 1: Tests qui échouent**

Dans `product-fuzzy-search.unit.spec.ts`, test « re-orders query.graph results… » : ajouter `metadata: { frais_expedition_xof: 2500 }` au premier produit simulé et `metadata: null` au second, puis :

```ts
    expect(result[0].shipping_fee_xof).toBe(2500)
    expect(result[1].shipping_fee_xof).toBe(1500)
    expect(result[0]).not.toHaveProperty("metadata")
```

Ajouter la même vérification (`shipping_fee_xof` présent, `metadata` absent) dans le test principal de `products-semantic-search/__tests__/route.unit.spec.ts` (produit simulé avec `metadata: { frais_expedition_xof: 2000 }` → `shipping_fee_xof: 2000`).

- [ ] **Step 2: Vérifier l'échec**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/product-fuzzy-search.unit.spec.ts src/api/store/products-semantic-search`
Expected: FAIL sur `shipping_fee_xof`.

- [ ] **Step 3: Implémenter**

Dans les deux listes de champs, ajouter après `"handle",` :

```ts
  // Frais d'expédition hors Ouagadougou (spec 2026-10-04) : transformés en
  // shipping_fee_xof, les métadonnées ne sortent pas de la route.
  "metadata",
```

Dans `fetchProductsWithAvailability`, dans la boucle `for (const product of products)` (après la boucle des variantes) :

```ts
    product.shipping_fee_xof = productShippingFee(product.metadata)
    delete product.metadata
```

Même ajout dans la boucle `for (const product of typedProducts)` de la route sémantique ; ajouter `metadata?: Record<string, unknown> | null` et `shipping_fee_xof?: number` au type `SearchProduct`. Importer `productShippingFee` depuis `lib/shipping-fee-rules` dans les deux fichiers.

- [ ] **Step 4: Vérifier**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/product-fuzzy-search.unit.spec.ts src/api/store/products-semantic-search && npm run build`
Expected: PASS ; build OK.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/product-fuzzy-search.ts apps/backend/src/api/store/products-semantic-search apps/backend/src/lib/__tests__/product-fuzzy-search.unit.spec.ts
git commit -m "feat(agent): frais d'expédition dans les recherches produit"
```

---

### Task 6: Encadré « Frais d'expédition » sur la fiche produit

**Files:**
- Create: `apps/backend/src/admin/widgets/product-shipping-fee.tsx`

Charger le skill `medusa-dev:building-admin-dashboard-customizations` avant d'écrire le widget.

- [ ] **Step 1: Écrire le widget**

```tsx
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/types"
import { useState } from "react"

// Frais d'expédition hors Ouagadougou du produit (spec 2026-10-04
// frais-expedition-par-produit), stockés dans product.metadata.frais_expedition_xof.
// Vide : 1 500 F par défaut. Toutes les autres métadonnées (video_url...) sont
// renvoyées telles quelles. HTML natif (conflit de types React 18/19 avec @medusajs/ui).
const KEY = "frais_expedition_xof"
const DEFAULT_FEE = 1500

const ProductShippingFeeWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const initial = product.metadata?.[KEY]
  const [saved, setSaved] = useState<string>(initial === undefined || initial === null ? "" : String(initial))
  const [value, setValue] = useState(saved)
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [message, setMessage] = useState<string | null>(null)

  async function save() {
    const trimmed = value.trim()
    if (trimmed !== "" && !/^\d+$/.test(trimmed)) {
      setStatus("error")
      setMessage("Saisissez un montant entier en F CFA (ou laissez vide).")
      return
    }
    setStatus("saving")
    setMessage(null)
    const metadata = { ...(product.metadata ?? {}) } as Record<string, unknown>
    if (trimmed === "") delete metadata[KEY]
    else metadata[KEY] = Number(trimmed)
    const res = await fetch(`/admin/products/${product.id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata }),
    })
    if (!res.ok) {
      setStatus("error")
      setMessage("Échec de l'enregistrement du produit.")
      return
    }
    // Garder la fiche à jour pour un second enregistrement sans rechargement.
    product.metadata = metadata
    setSaved(trimmed)
    setStatus("saved")
  }

  return (
    <div className="bg-ui-bg-base shadow-elevation-card-rest rounded-lg p-6">
      <h2 className="txt-compact-medium-plus text-ui-fg-base">Frais d'expédition (hors Ouagadougou)</h2>
      <p className="txt-compact-small text-ui-fg-subtle mt-1">
        Livraison gratuite à Ouagadougou. Plusieurs produits : les frais les plus élevés s'appliquent.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          inputMode="numeric"
          className="txt-compact-small w-32 rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-ui-fg-base"
          placeholder={String(DEFAULT_FEE)}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setStatus("idle")
          }}
        />
        <span className="txt-compact-small text-ui-fg-subtle">F CFA</span>
        <button
          type="button"
          className="txt-compact-small-plus rounded-md bg-ui-button-inverted px-3 py-1.5 text-ui-fg-on-inverted disabled:opacity-50"
          disabled={status === "saving" || value.trim() === saved}
          onClick={save}
        >
          {status === "saving" ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      <p className="txt-compact-small mt-2 text-ui-fg-muted">
        {saved === "" ? `Vide : ${DEFAULT_FEE} F par défaut.` : `Frais actuels : ${saved} F.`}
      </p>
      {status === "saved" && <p className="txt-compact-small mt-1 text-ui-fg-interactive">Enregistré.</p>}
      {message && <p className="txt-compact-small mt-1 text-ui-fg-error">{message}</p>}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default ProductShippingFeeWidget
```

- [ ] **Step 2: Vérifier**

Run: `cd apps/backend && npm run build` → OK.
En local (Playwright, admin de test) : fiche d'un produit qui a une vidéo (`metadata.video_url`) ; saisir 2000, Enregistrer ; recharger : « Frais actuels : 2000 F » et la vidéo est toujours là ; `GET /admin/products/<id>?fields=metadata` contient `video_url` et `frais_expedition_xof: 2000`. Saisir « 12,5 » → message d'erreur, rien d'enregistré. Vider → « Vide : 1500 F par défaut », la clé disparaît.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/admin/widgets/product-shipping-fee.tsx
git commit -m "feat(livraison): saisie des frais d'expédition sur la fiche produit"
```

---

### Task 7: Déploiement backend, bascule, vérifications

- [ ] **Step 1: Revue finale** par un agent frais (superpowers:requesting-code-review) sur les commits depuis `f28bb60` ; corriger ce qui est confirmé ; `npm run test:unit` complet.
- [ ] **Step 2: Staging** : `git push origin staging`, attendre la fin du build (`curl -s "https://api.github.com/repos/Abdazz/Golden-Market/actions/runs?per_page=3"`). Puis `ssh admin@144.91.110.105 'docker exec staging-golden-market-backend npm run setup:calculated-shipping'` (si le script `.ts` n'existe pas dans l'image, la variante `.js` du script npm s'exécute). Vérifier avec un panier par l'API store de staging (même scénario que Task 3 Step 3 : Kaya → frais, Ouagadougou → 0), depuis le conteneur n8n (`MEDUSA_BACKEND_URL`, `MEDUSA_PUBLISHABLE_KEY`). Ne pas compléter le panier.
- [ ] **Step 3: Production** : `git push origin staging:main` (après le build staging), attendre le build, `docker exec production-golden-market-backend npm run setup:calculated-shipping`, même vérification par panier (`MEDUSA_BACKEND_URL_PRODUCTION`, `MEDUSA_PUBLISHABLE_KEY_PRODUCTION`), sans compléter. Saisir `frais_expedition_xof = 1500` sur le balai-éponge (« serpillière auto-essorante à éponge ») seulement si le propriétaire le demande (sinon le défaut 1 500 F s'applique déjà).

---

### Task 8: n8n — l'agent annonce les frais d'expédition

**Files (VPS, CLI n8n)** : workflows `s6Ef6xBRxBeF6dgW` (find_products), `2pOjBE9G1Un877H8` (search_products_semantic), `oPWVebcSpuQrP4QQ` (browse_catalog), `EHll8zkvjwPJRJVz` (place_order), `i6KGA9BvK9unjxxj` (principal, consigne). Documentation : `../n8n_automation/guide-golden-market-agent.md`.

- [ ] **Step 1: Sauvegarder** les cinq workflows (`n8n export:workflow --id=…`) dans `~/n8n-backups/<date>/` sur le VPS.

- [ ] **Step 2: Patcher (script Python local, comme le 2026-10-04)**

Dans le nœud `Format Result` des trois outils de recherche, dans les deux formats de sortie (produit simple et produit à options), ajouter après la ligne de description :

```js
const feeText = `Frais d'expédition hors Ouagadougou : ${p.shipping_fee_xof ?? 1500} FCFA (livraison gratuite à Ouagadougou)`;
```

et l'insérer dans la chaîne renvoyée, juste après `Description : …` (`\n${feeText}`).

Dans `Format Result` de `place_order`, remplacer le texte `result` par :

```js
const shipping = Number(order.shipping_total ?? 0);
result: `Commande confirmée ! Numéro de commande : ${orderNumber}. Montant total : ${order.total} ${order.currency_code.toUpperCase()}${shipping > 0 ? ` (dont ${shipping} FCFA de frais d'expédition)` : ''}. Utilise get_payment_instructions pour indiquer au client comment payer.`,
```

et ajouter `shipping_total: shipping` au JSON renvoyé.

Dans la consigne de l'agent (nœud `AI Agent`, `systemMessage`), remplacer la phrase :
« Hors Ouagadougou, les frais d'expédition dépendent du produit : pour la serpillière / le balai-éponge auto-essorant, ils sont de 1 500 FCFA, à payer en plus du produit par Orange Money ou Moov Money ; pour tout autre produit, dis que l'équipe lui confirmera le montant. »
par :
« Hors Ouagadougou, les frais d'expédition sont indiqués pour chaque produit par find_products / search_products_semantic / browse_catalog ; pour plusieurs produits, seuls les frais les plus élevés s'appliquent (un seul colis). Ils sont ajoutés automatiquement à la commande : annonce toujours au client le total frais compris renvoyé par place_order avant qu'il paie. »

- [ ] **Step 3: Importer, publier, redémarrer** (`import:workflow`, `publish:workflow --id=` pour les cinq, `docker restart golden_market_n8n`), vérifier l'activité des workflows en base (`n8n.workflow_entity.active`).

- [ ] **Step 4: Vérifier** : exécuter une copie temporaire de `find_products` (déclencheur remplacé par un nœud Code du même nom + `manualTrigger`, cf. mémoire) avec `product_name: "balai"` → la sortie contient « Frais d'expédition hors Ouagadougou : 1500 FCFA » ; supprimer la copie de `n8n.workflow_entity`. `place_order` n'est pas exécuté (il créerait une vraie commande) : relire le nœud patché.

- [ ] **Step 5: Documenter et commit** : guide n8n (section « Frais d'expédition par produit (2026-10-04) » : outils, place_order, consigne), commit et push du dépôt `n8n_automation`.

---

### Task 9: Documentation et passation

- [ ] **Step 1:** `HANDOFF.md` : entrée datée (« Frais d'expédition par produit livrés » : encadré produit, option calculée, script joué sur staging et production, agent). `docs/HANDOFF-PROMPT.md` : état, et rappel au propriétaire de saisir les frais des produits qui ne sont pas à 1 500 F. Mémoire `mini-saas-gestion-livreurs.md`.

```bash
git add HANDOFF.md docs/HANDOFF-PROMPT.md
git commit -m "docs(handoff): frais d'expédition par produit livrés"
git push origin staging && git push origin staging:main
```
