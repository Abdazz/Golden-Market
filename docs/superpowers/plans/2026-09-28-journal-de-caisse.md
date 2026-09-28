# Journal de caisse — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Écran « Caisse » dans l'admin : solde, entrées/sorties du mois, chiffre d'affaires mensuel ; ventes et frais de livraison inscrits automatiquement, dépenses saisies à la main.

**Architecture:** Module Medusa `cashbook` (table `cash_entry`), règles pures testées (`src/lib/cashbook-rules.ts`), écritures via workflows, abonnés `payment.captured` / `payment.refunded`, frais inscrits à la fin d'une livraison (route `complete` existante), routes `/admin/cash-entries`, page admin `/app/cash`.

**Tech Stack:** Medusa 2.18 (module DML, workflows, subscribers), Jest, extension admin React (HTML natif).

**Spec:** `docs/superpowers/specs/2026-09-28-journal-de-caisse-design.md`

## Global Constraints

- Montants entiers F CFA > 0 ; `direction` `in`/`out` porte le signe.
- Écritures automatiques idempotentes par `reference` unique : `capture:<capture_id>`, `refund:<refund_id>`, `delivery:<delivery_id>:courier_fee`, `delivery:<delivery_id>:transport_fee`.
- Écritures automatiques non modifiables ni supprimables (409/400 clair).
- Mois au format `AAAA-MM`, heure de Ouagadougou (UTC).
- Mêmes conventions que le module `delivery` (skills medusa-dev) : écritures par workflows, Zod en middleware (`methods: [...]`), admin en HTML natif + `fetch` avec cookie.

## Review Focus

1. Paiement capturé en plusieurs fois (capture partielle) → une écriture par capture, jamais de doublon.
2. Événement rejoué (redémarrage, retry) → aucune écriture en double.
3. Livraison en échec avec frais de déplacement → sortie « frais livreur » inscrite, aucune vente.
4. Suppression demandée sur une écriture automatique → refus.
5. Mois sans écriture → totaux à 0 et solde reporté correct.

### Task 1: Module `cashbook`
Files: `apps/backend/src/modules/cashbook/{models/cash-entry.ts,service.ts,index.ts}`, `medusa-config.ts`, migration générée.
Modèle `cash_entry` : `id` (préfixe `cash`), `date` dateTime, `direction` enum in/out, `amount` number, `category` enum (sale, refund, courier_fee, transport_fee, purchase, advertising, opening_balance, other_in, other_out), `label` text, `note` text nullable, `source` enum auto/manual, `reference` text nullable **unique** (index `where reference IS NOT NULL AND deleted_at IS NULL`), `order_id` text nullable ; index sur `date`. `npx medusa db:generate cashbook && npx medusa db:migrate`. Vérif : table créée, tsc, suite verte. Commit.

### Task 2: Règles pures `src/lib/cashbook-rules.ts` (TDD)
- `parseManualEntry(body)` → `{ ok, values }` : direction, catégorie compatible (entrée : opening_balance/other_in ; sortie : purchase/advertising/other_out), montant entier > 0, libellé non vide, date ISO facultative (défaut maintenant).
- `monthOf(date)` → `AAAA-MM` ; `summarizeMonth(entries, month)` → `{ income, expenses, revenue (sale − refund), balanceBefore, balanceAfter }` ; `withRunningBalance(entries, balanceBefore)` (ordre chronologique) ; `monthlyHistory(entries, now, 12)` → `[{ month, sales, expenses, result }]`.
- `saleEntriesFromPayment(payment, orderNumber)` → une entrée par capture (`reference capture:<id>`) ; `refundEntriesFromPayment(...)` idem ; `feeEntriesFromDelivery(delivery, courierName, orderNumber)` → 0, 1 ou 2 sorties.
Tests : validations, solde reporté d'un mois vide, captures multiples, échec avec frais, expédition avec 2 frais.

### Task 3: Workflows
`src/workflows/cash-entries.ts` + étapes : `recordAutoEntriesWorkflow` (ignore les `reference` existantes : lecture puis création des manquantes ; compensation suppression), `createManualEntryWorkflow`, `updateManualEntryWorkflow` / `deleteManualEntryWorkflow` (refus `NOT_ALLOWED` si `source = auto`). Vérif locale par script jetable (double appel → une seule écriture ; suppression d'une auto refusée).

### Task 4: Inscriptions automatiques
- `src/subscribers/payment-captured-cashbook.ts` (`payment.captured`) et `payment-refunded-cashbook.ts` : lecture `payment` (`amount`, `captures.*`, `refunds.*`, `payment_collection.order.*` — vérifier le chemin réel du lien en local) → `recordAutoEntriesWorkflow` ; erreurs journalisées, jamais levées.
- `api/admin/deliveries/[id]/complete/route.ts` : après la clôture, `recordAutoEntriesWorkflow(feeEntriesFromDelivery(...))` dans un try/catch.
Tests unitaires des abonnés (query et workflow simulés) : capture → écriture ; erreur → pas d'exception. Vérif locale : « Marquer comme payé » sur une commande → entrée au journal ; livraison terminée → frais.

### Task 5: Routes admin
`GET /admin/cash-entries?month=AAAA-MM` → `{ month, entries (avec balance_after), summary, balance }` ; `POST /admin/cash-entries` (manuel) ; `POST /admin/cash-entries/:id` (modifier manuel) ; `DELETE /admin/cash-entries/:id` ; `GET /admin/cash-entries/history` → 12 mois. Zod en middleware. Vérif API locale.

### Task 6: Page admin « Caisse »
`src/admin/routes/cash/page.tsx` (menu « Caisse », icône `CurrencyDollar` ou équivalent disponible dans `@medusajs/icons`) : cartes Solde / Entrées / Sorties / CA du mois, sélecteur de mois, liste des écritures (montant coloré, lien commande, solde après), formulaire nouvelle écriture / modification, suppression (écritures manuelles), tableau 12 mois. Vérif Playwright locale. Build.

### Task 7: Déploiement et QA
Staging puis production ; vérifier la table en production, la page et les routes ; `AGENTS.md`, `HANDOFF.md`, mémoire.
