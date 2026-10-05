# Finitions du stock livreurs - plan de mise en oeuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** corriger les 7 défauts mineurs du stock confié aux livreurs (recherche produit, avertissement de déstockage, retour, erreurs de chargement, doublon en correction, variantes sans suivi, verrou).

**Architecture:** règles pures testées dans `src/lib/courier-stock-rules.ts` et `src/admin/lib/*`, workflows Medusa existants (`src/workflows/courier-stock.ts`) complétés d'un verrou, route `complete` enrichie d'un `stock_warning` persisté dans `delivery.sync_warning`, onglet admin `src/admin/components/courier-stock-tab.tsx` en HTML natif (pas de `@medusajs/ui` : conflit de types React 18/19).

**Tech Stack:** Medusa v2.18 (workflows-sdk, core-flows `acquireLockStep` / `releaseLockStep`), React 18 admin extensions, Jest (`npm run test:unit` dans `apps/backend`).

**Spec:** `docs/superpowers/specs/2026-10-06-finitions-stock-livreurs-design.md`

## Global Constraints

- Code, commentaires, UI et commits en français ; pas d'emoji ; pas de trailer `Co-Authored-By`.
- Style : pas de point-virgule, guillemets doubles, indentation 2 espaces ; `@medusajs/eslint-plugin` sans règle désactivée.
- Pas de nouvelle table, colonne ni migration.
- Pas de composant `@medusajs/ui` dans les extensions admin.
- Toute commande se lance depuis `apps/backend` ; gestionnaire de paquets : npm.
- Ne jamais toucher à la production, au VPS ni à n8n (le contrôleur s'en charge).
- Texte exact des messages : « Ce produit est saisi deux fois : gardez une seule ligne. » ; « Stock du livreur non mis à jour : enregistrez un Retour des articles livrés dans l'onglet Stock livreurs. » ; « Historique indisponible. » ; « Aucun produit ».

## Review Focus

- Correction avec deux lignes du même produit dont l'une a encore un champ quantité vide : le message « Quantité manquante. » reste prioritaire (comportement actuel), le doublon est signalé une fois les quantités saisies.
- Livraison dont le paiement ET le déstockage échouent : les deux avertissements doivent apparaître (aucun n'écrase l'autre) dans la réponse et dans `sync_warning`.
- Recherche avec espaces multiples, tirets ou apostrophes (« balai-eponge », « l'éponge ») : les mots se comparent sans accents ni ponctuation.
- Commande mêlant une variante suivie et une variante `manage_inventory = false` : seule la suivie est déstockée.
- Erreur du verrou (timeout de 10 s dépassé) pendant un mouvement manuel : erreur renvoyée à l'écran, aucun mouvement créé.

---

### Task 1: Règles et workflows serveur (doublon, variantes sans suivi, verrou)

**Files:**
- Modify: `apps/backend/src/lib/courier-stock-rules.ts`
- Modify: `apps/backend/src/workflows/steps/courier-stock-steps.ts` (étape `prepareDeliveryTakesStep`)
- Modify: `apps/backend/src/workflows/courier-stock.ts`
- Test: `apps/backend/src/lib/__tests__/courier-stock-rules.unit.spec.ts`

**Interfaces:**
- Produces: `inventoryByManagedVariant(variants: { id: string; manage_inventory?: boolean | null; inventory_items?: { inventory_item_id: string; required_quantity: number | string | null }[] | null }[]): Record<string, { inventory_item_id: string; required_quantity: number }[]>` ; `parseMovementLines` refuse le doublon en correction ; constante exportée `COURIER_STOCK_LOCK_KEY = "courier-stock"` dans `src/workflows/courier-stock.ts`.

- [ ] **Step 1: Write the failing tests** (ajouter dans `courier-stock-rules.unit.spec.ts`, importer `inventoryByManagedVariant`)

```ts
describe("inventoryByManagedVariant", () => {
  it("exclut les variantes sans suivi de stock et convertit les quantités", () => {
    expect(
      inventoryByManagedVariant([
        { id: "suivie", manage_inventory: true, inventory_items: [{ inventory_item_id: "balai", required_quantity: "2" }] },
        { id: "libre", manage_inventory: false, inventory_items: [{ inventory_item_id: "seau", required_quantity: 1 }] },
        { id: "sans-items", manage_inventory: true, inventory_items: null },
      ])
    ).toEqual({ suivie: [{ inventory_item_id: "balai", required_quantity: 2 }], "sans-items": [] })
  })
  it("commande mixte : seule la variante suivie produit un besoin", () => {
    const inv = inventoryByManagedVariant([
      { id: "suivie", manage_inventory: true, inventory_items: [{ inventory_item_id: "balai", required_quantity: 1 }] },
      { id: "libre", manage_inventory: false, inventory_items: [{ inventory_item_id: "seau", required_quantity: 1 }] },
    ])
    expect(orderItemNeeds([{ variant_id: "suivie", quantity: 2 }, { variant_id: "libre", quantity: 3 }], inv)).toEqual({ balai: 2 })
  })
})
```

Dans le `describe("parseMovementLines")` existant (le `ctx` y est déjà défini) :

```ts
  it("correction : refuse un produit saisi deux fois", () => {
    expect(() =>
      parseMovementLines("adjustment", [{ inventory_item_id: "balai", quantity: 1 }, { inventory_item_id: "balai", quantity: 4 }], ctx)
    ).toThrow("Ce produit est saisi deux fois : gardez une seule ligne.")
  })
  it("retour : les doublons s'additionnent toujours", () => {
    const r = parseMovementLines("return", [{ inventory_item_id: "balai", quantity: 1 }, { inventory_item_id: "balai", quantity: 1 }], ctx)
    expect(r.movements).toEqual([{ inventory_item_id: "balai", quantity: -2 }])
  })
```

(Vérifier que `ctx.balance.balai >= 2` dans le `ctx` existant ; sinon utiliser un `ctx` local `{ balance: { balai: 5 }, warehouse: { balai: 5 } }`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/courier-stock-rules.unit.spec.ts`
Expected: FAIL (`inventoryByManagedVariant` n'existe pas ; doublon non refusé).

- [ ] **Step 3: Implement** dans `courier-stock-rules.ts`

Dans `parseMovementLines`, branche `type === "adjustment"`, avant de construire `counted` :

```ts
    if (new Set(lines.map((l) => l.inventory_item_id)).size !== lines.length) {
      throw refuse("Ce produit est saisi deux fois : gardez une seule ligne.")
    }
```

Nouvelle règle, après `orderItemNeeds` :

```ts
// Table variante -> articles physiques pour le déstockage d'une livraison.
// Les variantes sans suivi de stock (manage_inventory = false) sont exclues :
// Medusa ne suit pas leur stock, le livreur ne les déstocke pas.
export const inventoryByManagedVariant = (
  variants: {
    id: string
    manage_inventory?: boolean | null
    inventory_items?: { inventory_item_id: string; required_quantity: number | string | null }[] | null
  }[]
) =>
  Object.fromEntries(
    variants
      .filter((v) => v.manage_inventory !== false)
      .map((v) => [
        v.id,
        (v.inventory_items ?? []).map((i) => ({ inventory_item_id: i.inventory_item_id, required_quantity: Number(i.required_quantity) })),
      ])
  ) as Record<string, { inventory_item_id: string; required_quantity: number }[]>
```

- [ ] **Step 4: Use it in `prepareDeliveryTakesStep`** (`workflows/steps/courier-stock-steps.ts`) : ajouter `"manage_inventory"` aux `fields` de la requête `product_variant`, remplacer la construction manuelle de `inventoryByVariant` par `const inventoryByVariant = inventoryByManagedVariant(variants)` (import depuis `../../lib/courier-stock-rules`).

- [ ] **Step 5: Lock in `workflows/courier-stock.ts`**

```ts
import { acquireLockStep, adjustInventoryLevelsStep, releaseLockStep } from "@medusajs/medusa/core-flows"

// Verrou commun à tous les mouvements : le dépôt est partagé entre livreurs ;
// deux mouvements simultanés liraient le même solde et pourraient le dépasser.
export const COURIER_STOCK_LOCK_KEY = "courier-stock"
```

Dans `recordCourierStockWorkflow` : `acquireLockStep({ key: COURIER_STOCK_LOCK_KEY, timeout: 10, ttl: 30 })` en première instruction, `releaseLockStep({ key: COURIER_STOCK_LOCK_KEY })` juste avant le `return`. Idem dans `takeDeliveryStockWorkflow`. Si deux appels à `releaseLockStep` dans le même fichier entrent en conflit de nom d'étape, nommer avec `.config({ name: "release-courier-stock-lock-delivery" })` (et `acquire-...` de même) pour le second workflow. `acquireLockStep` libère le verrou en compensation si le workflow échoue.

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/courier-stock-rules.unit.spec.ts src/lib/__tests__/courier-stock-query.unit.spec.ts && npx tsc --noEmit -p . 2>&1 | grep -E "courier-stock" ; npx eslint src/lib/courier-stock-rules.ts src/workflows/courier-stock.ts src/workflows/steps/courier-stock-steps.ts`
Expected: tests PASS, aucune erreur de type ni de lint sur ces fichiers.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/lib/courier-stock-rules.ts apps/backend/src/lib/__tests__/courier-stock-rules.unit.spec.ts apps/backend/src/workflows/courier-stock.ts apps/backend/src/workflows/steps/courier-stock-steps.ts
git commit -m "fix(stock-livreurs): doublon refusé en correction, variantes sans suivi ignorées, verrou des mouvements"
```

---

### Task 2: Avertissement de déstockage à « Livrée »

**Files:**
- Modify: `apps/backend/src/lib/courier-stock-rules.ts` (règle `combineWarnings`, constante `STOCK_WARNING`)
- Modify: `apps/backend/src/api/admin/deliveries/[id]/complete/route.ts`
- Modify: `apps/backend/src/admin/routes/deliveries/page.tsx` (vers la ligne 243-262, `onDone` de la validation)
- Test: `apps/backend/src/lib/__tests__/courier-stock-rules.unit.spec.ts`

**Interfaces:**
- Produces: `STOCK_WARNING: string` ; `combineWarnings(...warnings: (string | null | undefined)[]): string | null` (joint les avertissements non vides par une espace, `null` si aucun). Réponse de la route : nouveau champ `stock_warning: string | null` ; `sync_warning` (réponse et `delivery.sync_warning`) contient la combinaison des deux.

- [ ] **Step 1: Write the failing test**

```ts
describe("combineWarnings", () => {
  it("joint les avertissements présents, null si aucun", () => {
    expect(combineWarnings("Paiement non marqué.", STOCK_WARNING)).toBe(`Paiement non marqué. ${STOCK_WARNING}`)
    expect(combineWarnings(null, STOCK_WARNING)).toBe(STOCK_WARNING)
    expect(combineWarnings(null, undefined, "")).toBeNull()
  })
  it("texte de l'avertissement de stock", () => {
    expect(STOCK_WARNING).toBe("Stock du livreur non mis à jour : enregistrez un Retour des articles livrés dans l'onglet Stock livreurs.")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/courier-stock-rules.unit.spec.ts`
Expected: FAIL (exports absents).

- [ ] **Step 3: Implement** dans `courier-stock-rules.ts`

```ts
export const STOCK_WARNING = "Stock du livreur non mis à jour : enregistrez un Retour des articles livrés dans l'onglet Stock livreurs."

// Avertissements d'une livraison terminée (paiement, stock) : aucun n'écrase l'autre.
export const combineWarnings = (...warnings: (string | null | undefined)[]) =>
  warnings.filter((w): w is string => !!w && !!w.trim()).join(" ") || null
```

- [ ] **Step 4: Route `complete`** : réordonner pour que l'inscription de `sync_warning` se fasse une seule fois après le déstockage :
  1. calculer `syncWarning` comme aujourd'hui mais **sans** appeler `updateDeliveryWorkflow` à cet endroit ;
  2. dans le `catch` du déstockage, en plus du `logger.error` existant, `stockWarning = STOCK_WARNING` (déclarer `let stockWarning: string | null = null`) ;
  3. puis `const warning = combineWarnings(syncWarning, stockWarning)` et `if (warning) await updateDeliveryWorkflow(req.scope).run({ input: { id: delivery.id, sync_warning: warning } })` ;
  4. réponse : `res.json({ delivery: { ...delivery, sync_warning: warning }, sync_warning: warning, stock_warning: stockWarning, stock_taken: stockTaken, courier_name: courierName })`.
  Garder le commentaire en tête de bloc à jour.

- [ ] **Step 5: Page Livraisons** : le type du résultat reçoit `stock_warning?: string | null` ; la branche orange s'applique dès que `result.sync_warning` est non vide (il contient déjà l'avertissement de stock) : aucun autre changement de logique n'est nécessaire, vérifier seulement que le texte `Commande ${line.order_number} enregistrée. ${result.sync_warning}${taken}` reste correct.

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `cd apps/backend && npm run test:unit -- src/lib/__tests__/courier-stock-rules.unit.spec.ts && npx tsc --noEmit -p . 2>&1 | grep -E "complete/route|deliveries/page" ; npx eslint "src/api/admin/deliveries/[id]/complete/route.ts" src/admin/routes/deliveries/page.tsx`
Expected: PASS, aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/lib/courier-stock-rules.ts apps/backend/src/lib/__tests__/courier-stock-rules.unit.spec.ts "apps/backend/src/api/admin/deliveries/[id]/complete/route.ts" apps/backend/src/admin/routes/deliveries/page.tsx
git commit -m "fix(livraisons): avertissement visible et conservé si le stock du livreur n'est pas déstocké"
```

---

### Task 3: Onglet Stock livreurs (recherche, retour, erreurs, doublon)

**Files:**
- Create: `apps/backend/src/admin/lib/product-search.ts`
- Create: `apps/backend/src/admin/lib/__tests__/product-search.unit.spec.ts`
- Modify: `apps/backend/src/admin/lib/courier-stock-form.ts`
- Modify: `apps/backend/src/admin/lib/__tests__/courier-stock-form.unit.spec.ts`
- Modify: `apps/backend/src/admin/components/courier-stock-tab.tsx`

**Interfaces:**
- Produces: `normalizeSearch(text: string): string` ; `matchesSearch(label: string, query: string): boolean` ; composant local `ProductPicker` (dans `courier-stock-tab.tsx`) `{ choices: { id: string; label: string }[]; value: string; hint: (id: string) => string; onChange: (id: string) => void }`.

- [ ] **Step 1: Write the failing tests**

`admin/lib/__tests__/product-search.unit.spec.ts` :

```ts
import { matchesSearch, normalizeSearch } from "../product-search"

describe("normalizeSearch", () => {
  it("minuscules, sans accents, ponctuation en espaces, espaces réduits", () => {
    expect(normalizeSearch("  Balai-Éponge  l'Été ")).toBe("balai eponge l ete")
  })
})

describe("matchesSearch", () => {
  it("tous les mots, dans n'importe quel ordre, sans accents", () => {
    expect(matchesSearch("Balai-éponge à essorage", "eponge balai")).toBe(true)
    expect(matchesSearch("Balai-éponge à essorage", "BALAI-EPONGE")).toBe(true)
    expect(matchesSearch("Balai-éponge à essorage", "seau")).toBe(false)
  })
  it("requête vide : tout correspond", () => {
    expect(matchesSearch("Seau", "   ")).toBe(true)
  })
})
```

Dans `courier-stock-form.unit.spec.ts` :

```ts
  it("correction : un produit saisi deux fois est refusé", () => {
    expect(
      parseFormLines("adjustment", [
        { inventory_item_id: "balai", quantity: "1" },
        { inventory_item_id: "balai", quantity: "3" },
      ])
    ).toEqual({ error: "Ce produit est saisi deux fois : gardez une seule ligne." })
  })
  it("correction : quantité manquante prioritaire sur le doublon", () => {
    expect(
      parseFormLines("adjustment", [
        { inventory_item_id: "balai", quantity: "" },
        { inventory_item_id: "balai", quantity: "3" },
      ])
    ).toEqual({ error: "Quantité manquante." })
  })
  it("remise : doublons acceptés (additionnés par le serveur)", () => {
    expect(
      parseFormLines("handover", [
        { inventory_item_id: "balai", quantity: "1" },
        { inventory_item_id: "balai", quantity: "2" },
      ])
    ).toEqual({ lines: [{ inventory_item_id: "balai", quantity: 1 }, { inventory_item_id: "balai", quantity: 2 }] })
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/backend && npm run test:unit -- src/admin/lib/__tests__/product-search.unit.spec.ts src/admin/lib/__tests__/courier-stock-form.unit.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`admin/lib/product-search.ts` :

```ts
// Recherche d'un produit par nom dans les formulaires du stock livreurs :
// insensible aux accents, aux majuscules, à la ponctuation et à l'ordre des mots.

export const normalizeSearch = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

export const matchesSearch = (label: string, query: string) => {
  const haystack = normalizeSearch(label)
  return normalizeSearch(query)
    .split(" ")
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}
```

`courier-stock-form.ts`, dans `parseFormLines`, après le contrôle « Quantité manquante. » et avant le calcul de `parsed` :

```ts
  if (mode === "adjustment" && new Set(chosen.map((l) => l.inventory_item_id)).size !== chosen.length) {
    return { error: "Ce produit est saisi deux fois : gardez une seule ligne." }
  }
```

- [ ] **Step 4: Run tests to verify they pass** (même commande qu'au Step 2) : PASS.

- [ ] **Step 5: UI dans `courier-stock-tab.tsx`**

a) `ProductPicker` (remplace le `<select>` « Produit… » de chaque ligne) :

```tsx
const ProductPicker = ({
  choices,
  value,
  hint,
  onChange,
}: {
  choices: { id: string; label: string }[]
  value: string
  hint: (id: string) => string
  onChange: (id: string) => void
}) => {
  const selected = choices.find((c) => c.id === value)
  const [text, setText] = useState(selected?.label ?? "")
  const [open, setOpen] = useState(false)
  useEffect(() => setText(selected?.label ?? ""), [selected?.label])
  const matches = choices.filter((c) => matchesSearch(c.label, text)).slice(0, 30)
  return (
    <div className="relative min-w-0 flex-1">
      <input
        className={`${inputClass} w-full`}
        placeholder="Rechercher un produit…"
        value={text}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          if (value) onChange("")
        }}
      />
      {open && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-ui-border-base bg-ui-bg-base shadow-elevation-flyout">
          {matches.length ? (
            matches.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="txt-compact-small flex w-full flex-col items-start px-3 py-2 text-left hover:bg-ui-bg-base-hover"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(c.id)
                    setText(c.label)
                    setOpen(false)
                  }}
                >
                  <span className="text-ui-fg-base">{c.label}</span>
                  <span className="text-ui-fg-subtle">{hint(c.id)}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="txt-compact-small px-3 py-2 text-ui-fg-subtle">Aucun produit</li>
          )}
        </ul>
      )}
    </div>
  )
}
```

Dans `MovementForm`, remplacer le `<select>` produit par `<ProductPicker choices={choices} value={line.inventory_item_id} hint={hint} onChange={(id) => setLine(index, { inventory_item_id: id })} />`. Garder le `<span>` d'indication à droite de la quantité. Le champ quantité garde `max-w-[90px]`.

b) Retour : changement de livreur vide les lignes :

```tsx
onChange={(e) => {
  setCourierId(e.target.value)
  if (mode === "return") setLines([{ inventory_item_id: "", quantity: "" }])
}}
```

Comme les `ProductPicker` sont indexés par `index`, ajouter un compteur `const [resetKey, setResetKey] = useState(0)` incrémenté au même moment et utiliser `key={`${resetKey}-${index}`}` sur la `div` de chaque ligne pour que les champs de recherche se vident aussi.

c) Chargement en échec : dans `CourierStockTab`, état `const [loadError, setLoadError] = useState<string | null>(null)` ; `reload` remet `setLoadError(null)` puis, en cas d'échec, `setLoadError((e as Error).message || "Chargement impossible.")` (au lieu du `setNotice`). Rendu avant le test `!data` :

```tsx
if (!data && loadError)
  return (
    <div className="flex flex-col items-start gap-y-2">
      <NoticeText notice={{ kind: "error", text: loadError }} />
      <button type="button" className={secondaryButton} onClick={reload}>
        Réessayer
      </button>
    </div>
  )
```

Si `data` existe déjà et qu'un rechargement échoue, afficher l'erreur via `setNotice({ kind: "error", text: ... })` comme aujourd'hui.

d) `History` : état d'erreur distinct ; `.catch(() => setFailed(true))` et rendu `if (failed) return <p className="txt-compact-small text-ui-fg-error">Historique indisponible.</p>` ; remettre `failed` à `false` au début de chaque chargement.

- [ ] **Step 6: Typecheck, lint, tests**

Run: `cd apps/backend && npm run test:unit -- src/admin/lib/__tests__ && npx tsc --noEmit -p . 2>&1 | grep -E "courier-stock-tab|product-search|courier-stock-form" ; npx eslint src/admin/components/courier-stock-tab.tsx src/admin/lib/product-search.ts src/admin/lib/courier-stock-form.ts`
Expected: PASS, aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/admin/lib/product-search.ts apps/backend/src/admin/lib/__tests__/product-search.unit.spec.ts apps/backend/src/admin/lib/courier-stock-form.ts apps/backend/src/admin/lib/__tests__/courier-stock-form.unit.spec.ts apps/backend/src/admin/components/courier-stock-tab.tsx
git commit -m "feat(stock-livreurs): recherche produit par nom, retour remis à zéro au changement de livreur, erreurs de chargement visibles"
```

---

### Task 4 (contrôleur) : vérification locale, documentation, déploiement

- [ ] Suite unitaire complète : `cd apps/backend && npm run test:unit` (tout doit passer).
- [ ] Local (Playwright, bureau 1440 px et téléphone 390 px) : recherche « eponge » dans Remettre ; Retour + changement de livreur ; doublon en correction refusé ; arrêt du backend simulé -> « Réessayer » ; livraison « Livrée » avec stock livreur.
- [ ] `AGENTS.md` (section stock livreurs) : verrou `courier-stock`, variantes sans suivi ignorées, `sync_warning` porte aussi l'avertissement de stock.
- [ ] Revue finale par un agent frais (modèle le plus capable), corrections, puis staging, puis production.
