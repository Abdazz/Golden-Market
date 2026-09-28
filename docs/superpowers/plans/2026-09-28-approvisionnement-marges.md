# Approvisionnement et marges — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Commandes fournisseurs avec prix de revient calculé (formules de la feuille « Sourcing »), stock Medusa mis à jour à la réception, sortie de caisse à la commande, pages « Approvisionnement » et « Marges ».

**Architecture:** Module `procurement` (`supplier_order`, `supplier_order_line`, `variant_cost`), règles pures `src/lib/procurement-rules.ts`, workflows (créer/modifier brouillon, commander → caisse, réceptionner → `adjustInventoryLevelsStep` + coût courant, annuler → contrepassation), routes `/admin/supplier-orders*`, `/admin/margins*`, pages admin.

**Spec:** `docs/superpowers/specs/2026-09-28-approvisionnement-marges-design.md`

## Global Constraints

- Taux par défaut 670, frais 0,0299 ; montants F CFA arrondis à l'unité seulement à l'affichage et à l'écriture de caisse (calculs en flottant).
- Écritures de caisse via `recordAutoEntriesWorkflow` (module `cashbook`), références `supplier_order:<id>` et `supplier_order:<id>:cancel`.
- Stock : `adjustInventoryLevelsStep` (core-flows), un emplacement (premier `stock_location`), quantité × `required_quantity` par article d'inventaire de la variante.
- Conventions : workflows pour toute écriture, Zod en middleware (`methods: [...]`), admin HTML natif + `api()` de `src/admin/lib/deliveries.ts`.

## Review Focus

1. Variante « kit » (2 articles d'inventaire) réceptionnée → chaque article augmente de quantité × quantité requise.
2. Double clic sur « Réceptionner » → une seule réception (statut contrôlé dans l'étape).
3. Commande annulée après « Commander » → caisse contrepassée, stock inchangé.
4. Ligne à quantité 0 ou prix négatif → refus.
5. Variante supprimée entre-temps → réception refusée avec message clair.

### Task 1: Module `procurement` + migration
Modèles : `supplier_order` (id `sord`, reference, supplier nullable, ordered_at nullable, status enum draft/ordered/received/canceled défaut draft, exchange_rate number défaut 670, fee_rate float, note nullable, received_at nullable), `supplier_order_line` (id `sline`, supplier_order relation belongsTo / hasMany, variant_id, title, quantity number, unit_price_usd float, freight_usd float défaut 0, transport_xof number défaut 0, ads_usd float défaut 0, unit_cost_xof float nullable), `variant_cost` (id `vcost`, variant_id unique, unit_cost_xof float, source_line_id). Config + `db:generate procurement` + migrate.

### Task 2: Règles pures (TDD)
`lineCosts({ quantity, unit_price_usd, freight_usd, transport_xof, ads_usd }, { exchange_rate, fee_rate })` → `{ purchaseUsd, costTotal, unitCost, cashOut }` (cashOut = purchaseUsd × taux + transport) ; `margin(unitCost, price)` → `{ unit, percent }` ; `parseLine(body)` ; `inventoryAdjustments(lines, variantsInventory, locationId)` ; `orderCashEntry(order, lines)` / `cancelCashEntry`. Tests avec les valeurs de la feuille (détendeur, kit montre, rasoir).

### Task 3: Workflows
`saveSupplierOrderWorkflow` (création / mise à jour d'un brouillon, remplace les lignes), `placeSupplierOrderWorkflow` (draft → ordered, `ordered_at`, caisse), `receiveSupplierOrderWorkflow` (ordered → received : contrôle statut, ajustements de stock, coûts figés, `variant_cost` upsert), `cancelSupplierOrderWorkflow` (draft/ordered → canceled, contrepassation si ordered). Vérif par script jetable (stock réellement augmenté, kit compris).

### Task 4: Routes admin
`GET/POST /admin/supplier-orders`, `GET/POST /admin/supplier-orders/:id`, `POST .../:id/place|receive|cancel`, `GET /admin/margins?month=` (variantes : coût, prix, marge ; marge brute du mois sur les commandes payées), `GET /admin/supplier-orders/variants?q=` (recherche avec prix). Vérif API locale.

### Task 5: Pages admin « Approvisionnement » et « Marges »
Liste + fiche (lignes éditables, calculs en direct, actions), page Marges. Vérif Playwright (bureau + téléphone), build.

### Task 6: Déploiement et QA
Staging, production, documentation (`AGENTS.md`, `HANDOFF.md`, mémoire).
