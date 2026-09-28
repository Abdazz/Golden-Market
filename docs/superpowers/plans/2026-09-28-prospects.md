# Prospects à relancer — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Écran « Prospects » : à relancer aujourd'hui, en attente de stock (retours en stock en tête), suivi relancé / converti / perdu, conversion automatique à la commande.

**Architecture:** Module `prospects` (table `prospect`), règles pures `src/lib/prospect-rules.ts`, workflows (enregistrer, relancer, changer de statut, convertir), abonné `order.placed`, routes `/admin/prospects*`, page `/app/prospects`.

**Spec:** `docs/superpowers/specs/2026-09-28-prospects-design.md`

## Global Constraints
- Téléphones via `normalizePhone` (`+226XXXXXXXX`) ; dates `AAAA-MM-JJ` heure de Ouagadougou (UTC).
- Relance : +3 jours ; ajout : +1 jour. Un numéro actif (to_follow_up / waiting_stock) n'est jamais dupliqué.
- Conventions des modules précédents (workflows, Zod `methods: [...]`, admin HTML natif + `api()`).

## Review Focus
1. Même numéro saisi sous deux formats (« 70 00 00 00 » et « +22670000000 ») → une seule fiche.
2. Commande passée par un prospect `lost` → reste `lost`? Non : toute fiche non convertie passe `converted` (vente = succès).
3. Retour en stock d'une variante supprimée → pas d'erreur, fiche affichée sans disponibilité.
4. Relance d'un prospect converti → refus clair.
5. Liste « aujourd'hui » : les retards (date passée) inclus et signalés.

### Task 1: Module `prospects` + migration
### Task 2: Règles pures (TDD) : `parseProspect`, `addDays`, `dueToday(prospects, today)` (triés : retards d'abord), `nextFollowUp`, `matchProspectsForOrder(prospects, phone)`, `sortWaiting(prospects, availability)`.
### Task 3: Workflows : `saveProspectWorkflow` (création ou mise à jour d'une fiche active du même numéro), `followUpProspectWorkflow`, `setProspectStatusWorkflow`, `convertProspectsWorkflow`.
### Task 4: Abonné `order.placed` (conversion automatique) + routes `GET/POST /admin/prospects`, `POST /admin/prospects/:id`, `POST /admin/prospects/:id/follow-up`, `POST /admin/prospects/:id/status`.
### Task 5: Page admin « Prospects » (3 onglets, formulaire, actions), vérif Playwright bureau + téléphone, build.
### Task 6: Déploiement et QA (staging, production), documentation.
