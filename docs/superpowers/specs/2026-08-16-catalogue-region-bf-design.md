# Région Burkina Faso & import du catalogue produits — Design

Document de conception — implémente `ROADMAP.md` Phase 1 (« Catalogue & région
Burkina Faso ») dans son intégralité : région BF/XOF, zone de livraison, taxe, et
import des 29 produits réels depuis le fichier Excel fourni par le marchand.

## Contexte

Le backend Medusa n'a actuellement qu'une seule région (« Europe », seedée par le
starter, devises `eur`/`usd`, pays `gb/de/dk/se/fr/es/it`). Le storefront retombe
par défaut sur `dk`. Le catalogue ne contient que les deux produits de démo du
starter. Le marchand a fourni un fichier `Golden Market - Catalogue des produits.xlsx`
(29 produits réels, images intégrées, prix détail et gros) qui doit remplacer ce
catalogue de démonstration.

Décisions actées avec l'utilisateur le 2026-08-16 (avant ce document) :

1. **Un seul plan** couvrant la région BF/XOF complète (devise, zone de livraison,
   taxe) **et** l'import du catalogue — pas de découpage en deux plans séparés.
2. **Script re-exécutable** (`src/scripts/`, invoqué via `npx medusa exec`), pas
   `src/migration-scripts/` (qui ne s'exécute qu'une fois, trace en base, difficile
   à corriger en cas d'erreur de données).
3. **Le fichier Excel source est committé** dans le dépôt pour que l'import reste
   reproductible depuis un checkout propre.
4. **Descriptions manquantes** (13 produits sur 29) : reprennent le nom du produit.
5. **Relance idempotente** : un produit déjà existant (même titre) est sauté, pas
   dupliqué.
6. **Livraison BF** : une option unique à `0 XOF`, intitulée explicitement « à
   convenir avec le marchand » — cohérent avec le flux WhatsApp/Orange Money actuel
   où le marchand ajuste le montant réel après la commande.
7. **Paiement BF** : Orange Money uniquement (`orange-money-manual`), pas de
   `pp_system_default` — décision déjà actée dans `ARCHITECTURE.md`.

## Analyse du fichier source

`Golden Market - Catalogue des produits.xlsx` — 2 feuilles :

| Feuille | Produits | Colonnes | Description présente |
|---|---|---|---|
| « Produits en vente express » | 22 (lignes 4-25) | N°, images, Nom, **Prix détail (D)**, **Prix gros (E)**, Description (F) | 16/22 (lignes 10-25) |
| « Produits en vente sur commande » | 7 (lignes 4-10) | N°, images, Nom (C), Description (D, toujours vide), **Prix détail (E)**, **Prix gros (F)** | 0/7 |

**Important : l'ordre des colonnes prix/description diffère entre les deux
feuilles** (vérifié par lecture directe du XML, pas une supposition) — le script
doit mapper les colonnes par **en-tête**, pas par position fixe, pour ne pas
lire un prix comme une description ou inversement.

- **Images** : chaque produit a exactement une image intégrée, mappée à sa ligne
  via les ancres de dessin (`xdr:from > xdr:row`, 0-indexé). 29 images au total
  (28 `.jpg`, 1 `.png`), déjà vérifié 1:1 sans trou ni doublon.
- **Prix** : valeurs déjà en XOF « brut » (ex. `3000` = 3000 FCFA), pas de division
  par 100 nécessaire — confirmé par `apps/storefront/src/lib/constants.tsx`
  (`noDivisionCurrencies` inclut déjà `xof`) et par la config Medusa
  (`XOF.decimal_digits === 0`, `node_modules/@medusajs/utils/dist/defaults/currencies.js`).
- **Prix gros toujours inférieur ou égal au prix détail** dans les données
  observées (aucune anomalie à gérer côté script — si le fichier réel en contient,
  le script les importe telles quelles sans validation croisée, ce n'est pas son
  rôle de corriger les données du marchand).

## Architecture

Deux scripts indépendants dans `apps/backend/src/scripts/`, chacun invocable
séparément via `npx medusa exec`, exécutés dans l'ordre région → catalogue (le
catalogue n'a pas besoin de la région pour être créé, mais n'est vendable en XOF
qu'une fois la région et sa devise en place) :

```
apps/backend/src/scripts/
├── seed-region-bf.ts              # Partie 1 : région, taxe, livraison
├── import-catalog.ts              # Partie 2 : produits, collections, prix
└── catalog-import/
    ├── Golden Market - Catalogue des produits.xlsx   # déplacé depuis la racine
    └── parse-catalog.ts           # extraction xlsx -> données structurées
```

Séparer `parse-catalog.ts` (pure extraction de données, aucun appel Medusa) de
`import-catalog.ts` (orchestration des workflows Medusa) permet de tester
l'extraction indépendamment de la base de données.

### Partie 1 — `seed-region-bf.ts`

Suit exactement le pattern déjà établi par
`apps/backend/src/migration-scripts/initial-data-seed.ts` pour la région Europe,
adapté au Burkina Faso :

1. **Devise du store** : lire les `supported_currencies` actuels du store
   (`useQueryGraphStep` ou `storeModuleService.listStores`), puis
   `updateStoresWorkflow` avec la liste existante (`eur`, `usd`) **plus** `xof` —
   l'update remplace la liste entière (`CreateStoreCurrencyDTO[]`, pas de fusion
   documentée), donc il faut renvoyer l'ensemble, pas seulement l'ajout.
2. **Région** : `createRegionsWorkflow` — `name: "Burkina Faso"`,
   `currency_code: "xof"`, `countries: ["bf"]`,
   `payment_providers: ["orange-money-manual"]`.
3. **Tax region** : `createTaxRegionsWorkflow` — `country_code: "bf"`,
   `provider_id: "tp_system"` (même provider no-op que l'Europe, aucune règle de
   taxe spécifique demandée).
4. **Stock location** : `createStockLocationsWorkflow` — nom
   `"Entrepôt Ouagadougou"`, `country_code: "BF"`. Lié au sales channel par défaut
   via `linkSalesChannelsToStockLocationWorkflow` et au fulfillment provider
   `manual_manual` via `link.create` (même pattern que le seed existant).
5. **Fulfillment set** : `fulfillmentModuleService.createFulfillmentSets` — une
   `service_zone` « Burkina Faso » avec un `geo_zone` `{ country_code: "bf", type: "country" }`,
   liée au stock location.
6. **Option de livraison** : `createShippingOptionsWorkflow` — une seule option
   `"Livraison — à convenir avec le marchand"`, `price_type: "flat"`,
   `provider_id: "manual_manual"`, prix `{ currency_code: "xof", amount: 0 }`
   (et/ou `{ region_id: region.id, amount: 0 }`, comme le fait le seed existant
   pour l'Europe — les deux formes coexistent dans le pattern d'origine), mêmes
   `rules` (`enabled_in_store: true`, `is_return: false`) que l'Europe.

**Idempotence** : avant de créer la région, vérifier par nom (`"Burkina Faso"`)
si elle existe déjà — si oui, logger et sortir sans rien recréer (une ré-exécution
accidentelle ne doit pas dupliquer régions/stock locations/fulfillment sets).

### Partie 2 — `import-catalog.ts` + `parse-catalog.ts`

**`parse-catalog.ts`** — extraction pure, sans dépendance Medusa :

```typescript
export type ParsedProduct = {
  name: string
  description: string          // nom réutilisé si absente dans le fichier
  retailPrice: number           // XOF, montant brut
  wholesalePrice: number        // XOF, montant brut
  imageBuffer: Buffer
  imageExtension: string        // "jpg" | "png", déduit du buffer/nom de fichier
  collection: "express" | "sur-commande"
}

export async function parseCatalog(filePath: string): Promise<ParsedProduct[]>
```

Utilise `exceljs` (nouvelle dépendance : `cd apps/backend && npm install exceljs`) :
- `workbook.xlsx.readFile(filePath)`, une passe par feuille.
- Pour chaque feuille, mapper les en-têtes de la ligne 3 vers les lettres de
  colonne réelles (`Nom du produit` → colonne X, etc.) — **ne pas coder en dur**
  les lettres D/E/F, elles diffèrent entre les deux feuilles (voir plus haut).
- Lignes de données à partir de la ligne 4, jusqu'à la première ligne sans nom.
- `worksheet.getImages()` retourne `{ imageId, range: { tl: { row, col } } }` pour
  chaque image ; `workbook.getImage(parseInt(imageId))` retourne `{ buffer, extension }`.
  Faire correspondre `range.tl.row` (0-indexé) à la ligne Excel (`+1`) pour associer
  l'image à la bonne ligne de données.
- Une ligne sans image associée est un état invalide (ne devrait pas arriver
  d'après l'analyse ci-dessus) — le script doit le signaler explicitement
  (erreur nommant la ligne) plutôt que de créer un produit sans image.

**`import-catalog.ts`** — orchestration Medusa, `ExecArgs` en entrée
(`npx medusa exec ./src/scripts/import-catalog.ts`) :

1. Appelle `parseCatalog(...)` avec le chemin fixe vers le fichier committé.
2. Crée les 2 collections si absentes (recherche par titre avant création) :
   « Vente express », « Vente sur commande » (`createCollectionsWorkflow`).
3. Crée le groupe client « Grossistes » si absent
   (`createCustomerGroupsWorkflow`).
4. Récupère le sales channel par défaut (même requête que le seed existant).
5. Pour chaque produit parsé, **si un produit du même titre exact n'existe pas
   déjà** (recherche via `productModuleService.listProducts({ title })`) :
   a. Upload de l'image (`uploadFilesWorkflow`, `content` en base64,
      `access: "public"`).
   b. `createProductsWorkflow` avec :
      - `title`, `description` (nom si absente), `collection_id` selon la feuille
        source, `images: [{ url: uploadedFile.url }]`, `thumbnail` = même URL,
        `sales_channels: [{ id: defaultSalesChannel.id }]`,
        `options: [{ title: "Title", values: ["Default Title"] }]`.
      - Un variant unique : `title: "Default Title"`,
        `options: { Title: "Default Title" }`, **`manage_inventory: false`**
        (le fichier source ne donne aucune quantité en stock ; `manage_inventory`
        vaut `true` par défaut chez Medusa, ce qui rendrait chaque produit
        invendable — stock à 0 — tant qu'aucun niveau d'inventaire n'est créé.
        Mettre `false` explicitement fait apparaître les produits comme
        toujours disponibles, cohérent avec l'absence totale de suivi de stock
        dans les données du marchand), et **deux prix** :
        ```typescript
        prices: [
          { amount: retailPrice, currency_code: "xof" },
          {
            amount: wholesalePrice,
            currency_code: "xof",
            rules: { "customer.groups.id": grossistesGroup.id },
          },
        ]
        ```
        (mécanisme de règle de prix par variant — pas de price list séparée,
        cf. doc Medusa « Configure Product Variant Price by Customer Group » —
        atteint le même résultat que la price list envisagée initialement dans
        `ROADMAP.md`, avec moins de pièces mobiles : pas d'entité price list à
        créer/maintenir séparément).
   c. Sinon, logger que le produit existe déjà et passer au suivant.
6. Logger un résumé final : nombre créés / sautés / en erreur par feuille.

**Gestion d'erreur** : une erreur sur UN produit (upload d'image échoué, etc.) ne
doit pas interrompre l'import des 28 autres — logger l'erreur avec le nom du
produit concerné, continuer la boucle, inclure le compte d'échecs dans le résumé
final.

## Ordre d'exécution recommandé

```bash
cd apps/backend
npx medusa exec ./src/scripts/seed-region-bf.ts
npx medusa exec ./src/scripts/import-catalog.ts
```

Documenté dans `ROADMAP.md` et `apps/backend/README.md` (ou `AGENTS.md` si plus
approprié — à trancher pendant l'écriture du plan).

## Configuration storefront (bullets 2-3 de la Phase 1, inchangés)

- `apps/storefront/.env.local` : `NEXT_PUBLIC_DEFAULT_REGION=bf`.
- Vérifier manuellement après import que la clé publishable est bien liée au
  *Default Sales Channel* utilisé par les produits importés (sinon
  `GET /store/products` renvoie 0 produit — piège déjà documenté dans
  `ARCHITECTURE.md`).

## Tests

- `parse-catalog.ts` est testable unitairement sans base de données : test avec
  un petit fichier `.xlsx` de fixture (2-3 lignes, 1 image) vérifiant le mapping
  colonne/en-tête et l'association ligne/image.
- `import-catalog.ts` et `seed-region-bf.ts` ne sont pas couverts par des tests
  unitaires (ce sont des scripts d'orchestration appelant des workflows Medusa
  déjà testés par Medusa lui-même) — vérifiés par exécution réelle contre une
  base de dev, comme le seed existant.

## Hors périmètre (explicitement)

- Toute validation métier des prix (ex. alerter si prix gros > prix détail) —
  le script importe les données telles quelles.
- Gestion du stock/inventaire par produit (quantité) — non présente dans le
  fichier source ; tous les produits sont créés avec `manage_inventory: false`
  (toujours disponibles, aucun décompte de stock — voir Partie 2 ci-dessus).
- Mise à jour d'un produit déjà importé si ses données changent dans le fichier
  Excel (le script skip, ne met jamais à jour) — une évolution future si le
  marchand modifie son catalogue régulièrement.
- Synchronisation vers `public.products` (n8n) — toujours en phase différée.
