# Région Burkina Faso & import du catalogue produits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la boutique vendable au Burkina Faso : créer la région BF/XOF (devise, taxe, zone de livraison) et importer les 29 produits réels du marchand (2 collections, prix détail/gros, images) depuis le fichier Excel fourni.

**Architecture:** Deux scripts CLI Medusa indépendants (`npx medusa exec`), ré-exécutables et idempotents, dans `apps/backend/src/scripts/`. `seed-region-bf.ts` reproduit le pattern déjà établi par `initial-data-seed.ts` pour l'Europe, adapté au Burkina Faso. `import-catalog.ts` orchestre la création des produits ; toute la logique d'extraction du fichier Excel (lecture des cellules + des images intégrées) est isolée dans un module pur `catalog-import/parse-catalog.ts`, testable sans base de données.

**Tech Stack:** Medusa v2.18 (workflows core-flows), `exceljs` (nouvelle dépendance) pour la lecture du fichier source, Jest + @swc/jest pour les tests du module d'extraction.

**Spec:** `docs/superpowers/specs/2026-08-16-catalogue-region-bf-design.md`

## Global Constraints

- Pas de point-virgule, guillemets doubles, indentation 2 espaces — `AGENTS.md`.
- Fichiers en kebab-case — `AGENTS.md`.
- Commentaires et messages de commit en français — `ARCHITECTURE.md`.
- Nouvelle dépendance backend : `cd apps/backend && npm install <pkg>`, jamais à la racine — `AGENTS.md`.
- Aucun nouveau modèle de données custom dans ce plan : pas de `medusa db:generate`/`db:migrate` nécessaire.
- Les deux scripts vivent dans `src/scripts/` (pas `src/migration-scripts/`) — décision actée : ré-exécutabilité requise, pas d'exécution unique trackée en base.
- Idempotence obligatoire sur les deux scripts : une ré-exécution ne doit rien dupliquer (région déjà existante → sortie immédiate ; produit déjà existant par titre → ignoré).
- Prix XOF stockés en montant brut, sans division par 100 (XOF a `decimal_digits: 0` chez Medusa, déjà réfléchi côté storefront via `noDivisionCurrencies`).
- `manage_inventory: false` obligatoire sur chaque variant importé — le fichier source ne fournit aucune quantité de stock ; laisser la valeur par défaut (`true`) rendrait les produits invendables (stock à 0).
- Prix de gros exposé via une règle de prix sur le variant (`rules: { "customer.groups.id": <id> }`), pas via une `price list` séparée — plus simple pour ce cas d'usage, même résultat fonctionnel.
- Le fichier `Golden Market - Catalogue des produits.xlsx` est committé dans le dépôt (décision actée), déplacé de la racine vers `apps/backend/src/scripts/catalog-import/`.

---

## Task 1: Déplacer le fichier source et installer la dépendance `exceljs`

**Files:**
- Create: `apps/backend/src/scripts/catalog-import/Golden Market - Catalogue des produits.xlsx` (déplacé depuis la racine du dépôt)
- Modify: `apps/backend/package.json` (dépendance `exceljs`)
- Modify: `package-lock.json` (racine, régénéré par `npm install`)

**Interfaces:**
- Produces: le chemin fixe du fichier source, consommé par `DEFAULT_CATALOG_PATH` dans `parse-catalog.ts` (Task 2).

- [ ] **Step 1: Créer le répertoire et déplacer le fichier**

```bash
mkdir -p "/media/abdazz/data3/web/perso/medusa-golden-market/apps/backend/src/scripts/catalog-import"
git mv "/media/abdazz/data3/web/perso/medusa-golden-market/Golden Market - Catalogue des produits.xlsx" \
  "/media/abdazz/data3/web/perso/medusa-golden-market/apps/backend/src/scripts/catalog-import/Golden Market - Catalogue des produits.xlsx"
```

Si le fichier n'est pas encore suivi par git (`git status` le montre en `??`), utiliser `mv` puis `git add` du nouvel emplacement plutôt que `git mv`.

- [ ] **Step 2: Installer exceljs**

```bash
cd /media/abdazz/data3/web/perso/medusa-golden-market/apps/backend
npm install exceljs
```

Expected: `exceljs` ajouté aux `dependencies` de `apps/backend/package.json`.

- [ ] **Step 3: Vérifier**

```bash
cd /media/abdazz/data3/web/perso/medusa-golden-market
git status --short
```

Expected : le fichier xlsx apparaît à son nouvel emplacement (renommé si `git mv` a été utilisé), `apps/backend/package.json` et le lockfile racine modifiés. Rien d'autre.

- [ ] **Step 4: Commit**

```bash
cd /media/abdazz/data3/web/perso/medusa-golden-market
git add "apps/backend/src/scripts/catalog-import/Golden Market - Catalogue des produits.xlsx" apps/backend/package.json package-lock.json
git rm --cached "Golden Market - Catalogue des produits.xlsx" 2>/dev/null || true
git commit -m "$(cat <<'EOF'
Déplace le catalogue produits dans le backend et ajoute exceljs

Le fichier source vit désormais aux côtés du script qui le consomme
(apps/backend/src/scripts/catalog-import/), committé pour que l'import
reste reproductible depuis un checkout propre.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

Adapter les commandes `git add`/`git rm --cached` selon ce que `git status` a réellement montré à l'étape précédente.

---

## Task 2: Module d'extraction du catalogue (`parse-catalog.ts`)

**Files:**
- Create: `apps/backend/src/scripts/catalog-import/parse-catalog.ts`
- Test: `apps/backend/src/scripts/catalog-import/__tests__/parse-catalog.unit.spec.ts`

**Interfaces:**
- Produces: `ParsedProduct` (type), `parseWorkbook(workbook: ExcelJS.Workbook): ParsedProduct[]`, `parseCatalog(filePath: string): Promise<ParsedProduct[]>`, `DEFAULT_CATALOG_PATH: string` — consommés par `import-catalog.ts` (Task 4).

Le fichier réel a deux feuilles avec un **ordre de colonnes différent** (vérifié par lecture directe du fichier — pas une supposition) :
- Feuille 1 (« vente express ») : N°, images, Nom, **Prix détail**, **Prix gros**, Description.
- Feuille 2 (« vente sur commande ») : N°, images, Nom, Description, **Prix détail**, **Prix gros**.

Le mapping colonne doit donc se faire par **texte d'en-tête** (ligne 3 des deux feuilles), jamais par lettre de colonne fixe.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/scripts/catalog-import/__tests__/parse-catalog.unit.spec.ts
import ExcelJS from "exceljs"
import { parseWorkbook } from "../parse-catalog"

describe("parseWorkbook", () => {
  it("parses products from both sheets using header-based column mapping, with image and description fallback", () => {
    const workbook = new ExcelJS.Workbook()

    // Feuille 1 : ordre Nom, Prix détail, Prix gros, Description (comme le vrai fichier)
    const sheet1 = workbook.addWorksheet("Produits en vente express")
    sheet1.getCell("C3").value = "Nom du produit"
    sheet1.getCell("D3").value = "Prix en détail"
    sheet1.getCell("E3").value = "Prix en gros"
    sheet1.getCell("F3").value = "Description"

    sheet1.getCell("C4").value = "Produit sans description"
    sheet1.getCell("D4").value = 3000
    sheet1.getCell("E4").value = 2000
    // pas de F4 -> doit retomber sur le nom

    sheet1.getCell("C5").value = "Produit avec description"
    sheet1.getCell("D5").value = 9500
    sheet1.getCell("E5").value = 8500
    sheet1.getCell("F5").value = "Une belle description"

    const image1 = workbook.addImage({
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      extension: "png",
    })
    sheet1.addImage(image1, { tl: { col: 1, row: 3 }, br: { col: 2, row: 4 } })
    const image2 = workbook.addImage({
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      extension: "jpeg",
    })
    sheet1.addImage(image2, { tl: { col: 1, row: 4 }, br: { col: 2, row: 5 } })

    // Feuille 2 : ordre Nom, Description, Prix détail, Prix gros (inversé par rapport à la feuille 1)
    const sheet2 = workbook.addWorksheet("Prouits en vente sur commande")
    sheet2.getCell("C3").value = "Nom du produit"
    sheet2.getCell("D3").value = "Description"
    sheet2.getCell("E3").value = "Prix en détail"
    sheet2.getCell("F3").value = "Prix en gros"

    sheet2.getCell("C4").value = "Produit sur commande"
    sheet2.getCell("E4").value = 430500
    sheet2.getCell("F4").value = 380000

    const image3 = workbook.addImage({
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      extension: "png",
    })
    sheet2.addImage(image3, { tl: { col: 1, row: 3 }, br: { col: 2, row: 4 } })

    const products = parseWorkbook(workbook)

    expect(products).toHaveLength(3)

    expect(products[0]).toMatchObject({
      name: "Produit sans description",
      description: "Produit sans description",
      retailPrice: 3000,
      wholesalePrice: 2000,
      collection: "express",
      imageExtension: "png",
    })
    expect(products[0].imageBuffer).toBeInstanceOf(Buffer)

    expect(products[1]).toMatchObject({
      name: "Produit avec description",
      description: "Une belle description",
      retailPrice: 9500,
      wholesalePrice: 8500,
      collection: "express",
      imageExtension: "jpeg",
    })

    expect(products[2]).toMatchObject({
      name: "Produit sur commande",
      description: "Produit sur commande",
      retailPrice: 430500,
      wholesalePrice: 380000,
      collection: "sur-commande",
      imageExtension: "png",
    })
  })

  it("throws a clear error naming the row when a product has no associated image", () => {
    const workbook = new ExcelJS.Workbook()
    const sheet1 = workbook.addWorksheet("Produits en vente express")
    sheet1.getCell("C3").value = "Nom du produit"
    sheet1.getCell("D3").value = "Prix en détail"
    sheet1.getCell("E3").value = "Prix en gros"
    sheet1.getCell("F3").value = "Description"
    sheet1.getCell("C4").value = "Produit sans image"
    sheet1.getCell("D4").value = 1000
    sheet1.getCell("E4").value = 800

    const sheet2 = workbook.addWorksheet("Prouits en vente sur commande")
    sheet2.getCell("C3").value = "Nom du produit"
    sheet2.getCell("D3").value = "Description"
    sheet2.getCell("E3").value = "Prix en détail"
    sheet2.getCell("F3").value = "Prix en gros"

    expect(() => parseWorkbook(workbook)).toThrow(/ligne 4/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/scripts/catalog-import/__tests__/parse-catalog.unit.spec.ts`
Expected: FAIL — `../parse-catalog` n'existe pas encore.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/backend/src/scripts/catalog-import/parse-catalog.ts
import ExcelJS from "exceljs"
import path from "path"

export type ParsedProduct = {
  name: string
  description: string
  retailPrice: number
  wholesalePrice: number
  imageBuffer: Buffer
  imageExtension: string
  collection: "express" | "sur-commande"
}

const HEADERS = {
  name: "Nom du produit",
  retailPrice: "Prix en détail",
  wholesalePrice: "Prix en gros",
  description: "Description",
} as const

type ColumnMap = Record<keyof typeof HEADERS, number | null>

function findHeaderColumns(worksheet: ExcelJS.Worksheet): ColumnMap {
  const headerRow = worksheet.getRow(3)
  const columns: ColumnMap = {
    name: null,
    retailPrice: null,
    wholesalePrice: null,
    description: null,
  }

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = String(cell.value ?? "").trim()
    for (const [key, header] of Object.entries(HEADERS)) {
      if (text === header) {
        columns[key as keyof typeof HEADERS] = colNumber
      }
    }
  })

  return columns
}

type UnillustratedProduct = Omit<ParsedProduct, "imageBuffer" | "imageExtension">

function parseSheet(
  worksheet: ExcelJS.Worksheet,
  collection: ParsedProduct["collection"]
): UnillustratedProduct[] {
  const columns = findHeaderColumns(worksheet)

  if (!columns.name || !columns.retailPrice || !columns.wholesalePrice) {
    throw new Error(
      `Colonnes obligatoires introuvables dans la feuille "${worksheet.name}" (attendu : "${HEADERS.name}", "${HEADERS.retailPrice}", "${HEADERS.wholesalePrice}")`
    )
  }

  const products: UnillustratedProduct[] = []
  let rowNumber = 4

  // Les lignes produit sont contiguës à partir de la ligne 4 (vérifié sur le
  // fichier réel : aucune ligne vide au milieu des données).
  while (true) {
    const row = worksheet.getRow(rowNumber)
    const name = String(row.getCell(columns.name).value ?? "").trim()

    if (!name) {
      break
    }

    const description = columns.description
      ? String(row.getCell(columns.description).value ?? "").trim()
      : ""

    products.push({
      name,
      description: description || name,
      retailPrice: Number(row.getCell(columns.retailPrice).value),
      wholesalePrice: Number(row.getCell(columns.wholesalePrice).value),
      collection,
    })

    rowNumber += 1
  }

  return products
}

function attachImages(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  products: UnillustratedProduct[]
): ParsedProduct[] {
  const imagesByRow = new Map<number, { buffer: Buffer; extension: string }>()

  for (const image of worksheet.getImages()) {
    const excelRow = Math.round(image.range.tl.row) + 1
    const media = workbook.getImage(Number(image.imageId))
    imagesByRow.set(excelRow, {
      buffer: Buffer.isBuffer(media.buffer)
        ? media.buffer
        : Buffer.from(media.buffer as ArrayBuffer),
      extension: media.extension,
    })
  }

  return products.map((product, index) => {
    const excelRow = index + 4
    const image = imagesByRow.get(excelRow)

    if (!image) {
      throw new Error(
        `Aucune image trouvée pour le produit "${product.name}" (feuille "${worksheet.name}", ligne ${excelRow})`
      )
    }

    return { ...product, imageBuffer: image.buffer, imageExtension: image.extension }
  })
}

export function parseWorkbook(workbook: ExcelJS.Workbook): ParsedProduct[] {
  const [expressSheet, onOrderSheet] = workbook.worksheets

  if (!expressSheet || !onOrderSheet) {
    throw new Error(
      `Le fichier doit contenir 2 feuilles (vente express, vente sur commande) — trouvé ${workbook.worksheets.length}`
    )
  }

  const expressProducts = attachImages(workbook, expressSheet, parseSheet(expressSheet, "express"))
  const onOrderProducts = attachImages(
    workbook,
    onOrderSheet,
    parseSheet(onOrderSheet, "sur-commande")
  )

  return [...expressProducts, ...onOrderProducts]
}

export async function parseCatalog(filePath: string): Promise<ParsedProduct[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  return parseWorkbook(workbook)
}

export const DEFAULT_CATALOG_PATH = path.join(
  __dirname,
  "Golden Market - Catalogue des produits.xlsx"
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/scripts/catalog-import/__tests__/parse-catalog.unit.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Verify against the real file**

Run un script ad-hoc pour confirmer que `parseCatalog(DEFAULT_CATALOG_PATH)` lit bien les 29 produits réels (sans toucher la base de données) :

```bash
cd apps/backend
npx tsx -e "
import('./src/scripts/catalog-import/parse-catalog').then(async (m) => {
  const products = await m.parseCatalog(m.DEFAULT_CATALOG_PATH)
  console.log('Total:', products.length)
  console.log('Express:', products.filter((p) => p.collection === 'express').length)
  console.log('Sur commande:', products.filter((p) => p.collection === 'sur-commande').length)
  console.log('Exemple:', products[0])
})
"
```

Si `tsx` n'est pas disponible, utiliser `npx ts-node` (déjà en devDependency du projet) avec les mêmes options que le reste du backend, ou un test Jest temporaire. Expected: `Total: 29`, `Express: 22`, `Sur commande: 7`.

- [ ] **Step 6: Commit**

```bash
cd apps/backend
git add src/scripts/catalog-import/parse-catalog.ts src/scripts/catalog-import/__tests__/parse-catalog.unit.spec.ts
git commit -m "$(cat <<'EOF'
Ajoute l'extraction du catalogue produits depuis le fichier Excel

Mapping des colonnes par en-tête (pas par position fixe) car les deux
feuilles du fichier n'ont pas le même ordre de colonnes. Testable sans
base de données : le test construit son propre classeur en mémoire.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Script de seed de la région Burkina Faso

**Files:**
- Create: `apps/backend/src/scripts/seed-region-bf.ts`
- Modify: `apps/backend/package.json` (script npm `seed:region-bf`)

**Interfaces:**
- Produces: la région « Burkina Faso » (devise `xof`, provider `orange-money-manual`) — consommée manuellement par la Task 6 (vérification E2E) et par tout achat réel une fois en production.

Pas de test automatisé (même convention que `initial-data-seed.ts`, qui n'en a pas non plus — ce sont des scripts d'orchestration de workflows Medusa déjà testés par Medusa).

- [ ] **Step 1: Écrire le script**

```typescript
// apps/backend/src/scripts/seed-region-bf.ts
import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createRegionsWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"

export default async function seedRegionBf({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const regionModuleService = container.resolve(Modules.REGION)
  const storeModuleService = container.resolve(Modules.STORE)
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)

  const [existingRegion] = await regionModuleService.listRegions({
    name: "Burkina Faso",
  })

  if (existingRegion) {
    logger.info("La région Burkina Faso existe déjà, rien à faire.")
    return
  }

  logger.info("Ajout de la devise XOF au store...")
  const [store] = await storeModuleService.listStores()
  const currentCurrencies =
    store.supported_currencies?.map((c) => ({
      currency_code: c.currency_code,
      is_default: c.is_default,
    })) ?? []

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        supported_currencies: [
          ...currentCurrencies,
          { currency_code: "xof", is_default: false },
        ],
      },
    },
  })

  logger.info("Création de la région Burkina Faso...")
  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Burkina Faso",
          currency_code: "xof",
          countries: ["bf"],
          payment_providers: ["orange-money-manual"],
        },
      ],
    },
  })
  const region = regionResult[0]

  logger.info("Création de la tax region...")
  await createTaxRegionsWorkflow(container).run({
    input: [{ country_code: "bf", provider_id: "tp_system" }],
  })

  logger.info("Création du stock location...")
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "Entrepôt Ouagadougou",
          address: { city: "Ouagadougou", country_code: "BF", address_1: "" },
        },
      ],
    },
  })
  const stockLocation = stockLocationResult[0]

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  })

  const { data: shippingProfileResult } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const shippingProfile = shippingProfileResult[0]

  logger.info("Création du fulfillment set...")
  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "Burkina Faso delivery",
    type: "shipping",
    service_zones: [
      {
        name: "Burkina Faso",
        geo_zones: [{ country_code: "bf", type: "country" }],
      },
    ],
  })

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  })

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [store.default_sales_channel_id!],
    },
  })

  logger.info("Création de l'option de livraison...")
  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Livraison — à convenir avec le marchand",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "À convenir",
          description:
            "Le montant de la livraison est convenu avec le marchand après la commande.",
          code: "a-convenir",
        },
        prices: [
          { currency_code: "xof", amount: 0 },
          { region_id: region.id, amount: 0 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
    ],
  })

  logger.info("Région Burkina Faso créée avec succès.")
}
```

- [ ] **Step 2: Ajouter le script npm**

Dans `apps/backend/package.json`, section `scripts`, ajouter :

```json
    "seed:region-bf": "medusa exec ./src/scripts/seed-region-bf.ts",
```

- [ ] **Step 3: Vérification manuelle**

```bash
docker compose up -d
cd apps/backend
npm run dev &
sleep 15
npx medusa exec ./src/scripts/seed-region-bf.ts
```

Expected dans les logs : les 6 messages `logger.info` de création, se terminant par « Région Burkina Faso créée avec succès. », sans erreur.

Relancer la même commande une seconde fois :

```bash
npx medusa exec ./src/scripts/seed-region-bf.ts
```

Expected : un seul message « La région Burkina Faso existe déjà, rien à faire. », aucune erreur, aucune duplication (vérifiable dans l'admin `/app/settings/regions`).

Arrêter le serveur de dev une fois la vérification terminée.

- [ ] **Step 4: Commit**

```bash
cd apps/backend
git add src/scripts/seed-region-bf.ts package.json
git commit -m "$(cat <<'EOF'
Ajoute le script de création de la région Burkina Faso

Devise XOF, tax region, stock location, fulfillment set et option de
livraison "à convenir avec le marchand" (0 XOF) — même pattern que le
seed Europe existant. Paiement Orange Money uniquement, décision déjà
actée dans ARCHITECTURE.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Script d'import du catalogue

**Files:**
- Create: `apps/backend/src/scripts/import-catalog.ts`
- Modify: `apps/backend/package.json` (script npm `import:catalog`)

**Interfaces:**
- Consumes: `parseCatalog`, `DEFAULT_CATALOG_PATH`, `ParsedProduct` (Task 2).
- Produces: 29 produits Medusa (2 collections, 1 groupe client « Grossistes », prix XOF détail + gros par règle client) — consommés manuellement par la Task 6.

Pas de test automatisé (orchestration de workflows Medusa déjà testés, même convention que `initial-data-seed.ts`) — vérifié par exécution réelle en Task 6.

- [ ] **Step 1: Écrire le script**

```typescript
// apps/backend/src/scripts/import-catalog.ts
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createCollectionsWorkflow,
  createCustomerGroupsWorkflow,
  createProductsWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  DEFAULT_CATALOG_PATH,
  ParsedProduct,
  parseCatalog,
} from "./catalog-import/parse-catalog"

const COLLECTION_TITLES: Record<ParsedProduct["collection"], string> = {
  express: "Vente express",
  "sur-commande": "Vente sur commande",
}

const WHOLESALE_GROUP_NAME = "Grossistes"

async function ensureCollection(container: ExecArgs["container"], title: string) {
  const productModuleService = container.resolve(Modules.PRODUCT)
  const [existing] = await productModuleService.listProductCollections({ title })

  if (existing) {
    return existing
  }

  const { result } = await createCollectionsWorkflow(container).run({
    input: { collections: [{ title }] },
  })

  return result[0]
}

async function ensureCustomerGroup(container: ExecArgs["container"], name: string) {
  const customerModuleService = container.resolve(Modules.CUSTOMER)
  const [existing] = await customerModuleService.listCustomerGroups({ name })

  if (existing) {
    return existing
  }

  const { result } = await createCustomerGroupsWorkflow(container).run({
    input: { customersData: [{ name }] },
  })

  return result[0]
}

export default async function importCatalog({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModuleService = container.resolve(Modules.PRODUCT)
  const storeModuleService = container.resolve(Modules.STORE)

  logger.info(`Lecture du catalogue depuis ${DEFAULT_CATALOG_PATH}`)
  const parsedProducts = await parseCatalog(DEFAULT_CATALOG_PATH)
  logger.info(`${parsedProducts.length} produits trouvés dans le fichier`)

  const collections = {
    express: await ensureCollection(container, COLLECTION_TITLES.express),
    "sur-commande": await ensureCollection(
      container,
      COLLECTION_TITLES["sur-commande"]
    ),
  }
  const wholesaleGroup = await ensureCustomerGroup(container, WHOLESALE_GROUP_NAME)

  const [store] = await storeModuleService.listStores()
  const defaultSalesChannelId = store.default_sales_channel_id!

  let created = 0
  let skipped = 0
  let failed = 0

  for (const product of parsedProducts) {
    const [existing] = await productModuleService.listProducts({
      title: product.name,
    })

    if (existing) {
      logger.info(`Produit déjà existant, ignoré : "${product.name}"`)
      skipped += 1
      continue
    }

    try {
      const { result: uploadedFiles } = await uploadFilesWorkflow(container).run({
        input: {
          files: [
            {
              filename: `${product.name}.${product.imageExtension}`,
              mimeType: `image/${
                product.imageExtension === "jpg" ? "jpeg" : product.imageExtension
              }`,
              content: product.imageBuffer.toString("base64"),
              access: "public",
            },
          ],
        },
      })
      const imageUrl = uploadedFiles[0].url

      await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: product.name,
              description: product.description,
              collection_id: collections[product.collection].id,
              images: [{ url: imageUrl }],
              thumbnail: imageUrl,
              sales_channels: [{ id: defaultSalesChannelId }],
              options: [{ title: "Title", values: ["Default Title"] }],
              variants: [
                {
                  title: "Default Title",
                  options: { Title: "Default Title" },
                  manage_inventory: false,
                  prices: [
                    { amount: product.retailPrice, currency_code: "xof" },
                    {
                      amount: product.wholesalePrice,
                      currency_code: "xof",
                      rules: { "customer.groups.id": wholesaleGroup.id },
                    },
                  ],
                },
              ],
            },
          ],
        },
      })

      created += 1
    } catch (error) {
      logger.error(`Échec de la création du produit "${product.name}"`, error as Error)
      failed += 1
    }
  }

  logger.info(
    `Import terminé : ${created} créés, ${skipped} ignorés (déjà existants), ${failed} en erreur`
  )
}
```

- [ ] **Step 2: Ajouter le script npm**

Dans `apps/backend/package.json`, section `scripts`, ajouter :

```json
    "import:catalog": "medusa exec ./src/scripts/import-catalog.ts",
```

- [ ] **Step 3: Vérification manuelle**

Prérequis : Task 3 déjà exécutée au moins une fois (région BF créée) ou non — l'import ne dépend pas de la région, mais avoir la région et sa devise XOF en place permet de vérifier tout de suite que les prix s'affichent correctement au checkout.

```bash
cd apps/backend
npm run dev &
sleep 15
npx medusa exec ./src/scripts/import-catalog.ts
```

Expected dans les logs : « 29 produits trouvés dans le fichier », puis 29 lignes de création, puis « Import terminé : 29 créés, 0 ignorés, 0 en erreur ».

Vérifier dans l'admin (`/app/products`) : 29 produits, chacun avec une image, répartis dans les 2 collections (`/app/collections`).

Relancer la commande une seconde fois :

```bash
npx medusa exec ./src/scripts/import-catalog.ts
```

Expected : « Import terminé : 0 créés, 29 ignorés, 0 en erreur ». Aucun doublon dans l'admin.

Arrêter le serveur de dev une fois la vérification terminée.

- [ ] **Step 4: Commit**

```bash
cd apps/backend
git add src/scripts/import-catalog.ts package.json
git commit -m "$(cat <<'EOF'
Ajoute le script d'import du catalogue produits

29 produits (2 collections, images uploadées, prix détail/gros via
règle de prix sur le groupe client "Grossistes"). Idempotent : un
produit déjà existant (même titre) est ignoré, pas dupliqué.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Documentation

**Files:**
- Modify: `AGENTS.md` (commandes)
- Modify: `ROADMAP.md` (cocher les items Phase 1 réalisés)
- Modify: `HANDOFF.md` (statut Phase 1)

- [ ] **Step 1: Documenter les nouvelles commandes dans AGENTS.md**

Dans la section « Database » ou une nouvelle section « Catalogue » d'`AGENTS.md`, ajouter :

```markdown
### Catalogue Burkina Faso (one-shot, idempotent)

```bash
cd apps/backend
npx medusa exec ./src/scripts/seed-region-bf.ts   # région BF/XOF, taxe, livraison
npx medusa exec ./src/scripts/import-catalog.ts   # 29 produits depuis le fichier Excel
```

Les deux scripts sont ré-exécutables sans risque de doublon (vérification par nom/titre avant création).
```

- [ ] **Step 2: Mettre à jour ROADMAP.md**

Dans la section « Phase 1 — Catalogue & région Burkina Faso », cocher les 4 items (`[x]`) et ajouter une note indiquant que l'implémentation vit dans `apps/backend/src/scripts/seed-region-bf.ts` et `import-catalog.ts`.

- [ ] **Step 3: Mettre à jour HANDOFF.md**

Dans la section « Phase 1 », passer le statut global à `fait`, cocher les items, et ajouter une entrée de journal résumant ce qui a été livré (région BF, 29 produits, 2 collections, groupe Grossistes) et tout point resté ouvert (ex. le tarif de livraison à 0 XOF est un placeholder volontaire, pas un vrai tarif).

- [ ] **Step 4: Commit**

```bash
cd /media/abdazz/data3/web/perso/medusa-golden-market
git add AGENTS.md ROADMAP.md HANDOFF.md
git commit -m "$(cat <<'EOF'
Documente les scripts de la Phase 1 et clôture le suivi

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Vérification bout en bout et configuration storefront

**Files:**
- Modify: `apps/storefront/.env.local`

Pas de nouveau code applicatif — cette tâche configure le storefront pour la nouvelle région et vérifie le parcours d'achat réel en XOF.

- [ ] **Step 1: Configurer le storefront**

Dans `apps/storefront/.env.local`, ajouter/modifier :

```
NEXT_PUBLIC_DEFAULT_REGION=bf
```

- [ ] **Step 2: Vérifier le lien clé publishable ↔ sales channel**

Dans l'admin Medusa (`/app/settings/publishable-api-keys`), confirmer que la clé publishable utilisée par le storefront est bien liée au *Default Sales Channel* — celui auquel les 29 produits importés sont rattachés (Task 4, `defaultSalesChannelId`). Sinon `GET /store/products` renverra 0 produit (piège déjà documenté dans `ARCHITECTURE.md`).

- [ ] **Step 3: Parcours d'achat complet en XOF**

```bash
docker compose up -d
cd apps/backend && npm run dev &
cd apps/storefront && npm run dev -- -p 8001 &
sleep 20
```

Avec un navigateur (ou un outil MCP Playwright si disponible) :
1. Aller sur `http://localhost:8001` — vérifier la redirection vers `/bf` (région Burkina Faso par défaut).
2. Parcourir le catalogue : les 29 produits doivent apparaître, prix affichés en FCFA (XOF), répartis visiblement entre les deux collections.
3. Ouvrir un produit, vérifier que l'image s'affiche correctement.
4. Ajouter un produit au panier → checkout → vérifier que l'option de livraison « à convenir avec le marchand » (0 FCFA) est proposée et sélectionnable.
5. Choisir Orange Money au paiement (seul provider proposé pour cette région — vérifier qu'aucun autre n'apparaît).
6. Passer la commande, vérifier la confirmation.

- [ ] **Step 4: Vérifier le prix de gros (optionnel, si le temps le permet)**

Dans l'admin, créer un client de test et l'ajouter au groupe « Grossistes » (`/app/customer-groups`). Se connecter avec ce client côté storefront (ou vérifier via l'API `/store/products/:id` avec le contexte du groupe) et confirmer que le prix affiché est le prix de gros, pas le prix détail. Si le storefront actuel n'a pas de notion de connexion liée à un groupe tarifaire particulier côté vitrine, documenter cette limite dans `HANDOFF.md` plutôt que de construire une UI dédiée (hors périmètre de ce plan).

- [ ] **Step 5: Arrêter les serveurs et commit**

```bash
fuser -k 9001/tcp 8001/tcp 2>/dev/null || true
cd /media/abdazz/data3/web/perso/medusa-golden-market
git add apps/storefront/.env.local
git commit -m "$(cat <<'EOF'
Configure le storefront sur la région Burkina Faso par défaut

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

Note : `apps/storefront/.env.local` est gitignored (`**/.env.local`) — si le commit ne trouve rien à committer, c'est attendu ; documenter la variable dans `AGENTS.md`/`ROADMAP.md` à la place (déjà fait en Task 5) et s'assurer qu'elle est bien positionnée manuellement dans l'environnement de dev/prod.

---

## Self-Review Notes

- **Spec coverage :** les 4 items de la section Phase 1 du `ROADMAP.md` sont couverts — région BF (Task 3), `NEXT_PUBLIC_DEFAULT_REGION` (Task 6), clé publishable (Task 6, vérification), import catalogue (Tasks 1-2-4).
- **Type consistency :** `ParsedProduct["collection"]` (`"express" | "sur-commande"`) défini une fois dans `parse-catalog.ts` (Task 2), consommé identiquement par `COLLECTION_TITLES` dans `import-catalog.ts` (Task 4). `DEFAULT_CATALOG_PATH` défini en Task 2, consommé en Task 4.
- **Idempotence croisée :** Task 3 (région) et Task 4 (produits) sont indépendamment idempotents ; leur ordre d'exécution relatif n'a pas d'importance pour la ré-exécutabilité, seulement pour la vérification immédiate des prix en XOF (Task 6 recommande Task 3 avant Task 4, sans l'imposer).
- **Hors périmètre explicite :** validation métier des prix (gros > détail), mise à jour d'un produit déjà importé si le fichier Excel change, synchronisation n8n, UI storefront dédiée à la sélection du tarif grossiste (Task 6 Step 4 est optionnelle et documente la limite plutôt que de la combler).
