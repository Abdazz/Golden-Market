# Tableau de bord de gestion — design

## Contexte

Le mini-SaaS de gestion (Livraisons, Stock livreurs, Caisse, Approvisionnement
et marges, Prospects, Chat WhatsApp) est en production, mais chaque information
vit sur sa propre page : pour savoir où en est la journée, le propriétaire doit
ouvrir cinq pages. Choix validés avec lui le 2026-10-04 :

- usage : **l'action d'abord** (« À faire aujourd'hui » en haut), les chiffres
  du jour et du mois ensuite ;
- « À faire » : commandes à confier, livraisons en cours, prospects à relancer,
  conversations WhatsApp en attente de réponse ;
- ventes : **commandé et encaissé** (deux chiffres distincts, l'écart compte
  avec le paiement à la livraison) ;
- approche : une route backend qui calcule tout, une page admin dédiée.

## Objectif

En ouvrant l'admin le matin, voir sur un seul écran ce qu'il reste à faire
aujourd'hui et comment se porte le mois, chaque ligne menant à la page qui
permet d'agir. Le tableau de bord est en **lecture seule**.

## 1. Contenu

Jours en UTC (= heure de Ouagadougou, `todayInOuaga`), mois du 1er à
aujourd'hui (`monthOf`). Montants en FCFA (XOF, entiers).

### « À faire aujourd'hui »

Chaque ligne : un nombre, un court détail, un lien. Une ligne à 0 reste
affichée, grisée (« rien à faire » est une information).

| Ligne | Définition | Lien |
|---|---|---|
| Commandes à confier | Même règle que l'onglet « À confier » (`/admin/deliveries/to-assign`) : commandes non annulées / brouillon / archivées, ni livrées ni expédiées, sans livraison `assigned` / `delivered` / `shipped`. Détail : dont N « à relivrer ». | `/app/deliveries` |
| Livraisons en cours | Livraisons `assigned`, tous jours prévus confondus. Détail : dont N en retard (`tour_date` < aujourd'hui). | `/app/deliveries` |
| Argent à récupérer chez les livreurs | Pour chaque livreur et chaque jour où il a terminé au moins une livraison (`delivered` / `failed` / `shipped`, jour de `completed_at`) **sans versement validé** (`courier_settlement` pour ce livreur et ce jour) : montant `computeSettlement(...).toRemit`. Total, plus détail par livreur (nom, montant, nombre de jours). Un montant négatif (frais > encaissé) est affiché tel quel, comme dans l'onglet Tournée. | `/app/deliveries` |
| Prospects à relancer | `dueToday` (relance prévue aujourd'hui ou avant) ; détail : dont N en retard, plus N « en attente de stock » dont le produit est de nouveau disponible (`sortWaiting`, `available === true`). | `/app/prospects` |
| Conversations en attente | Conversations dont `awaitingReply` est vrai (`listConversations`, même point que dans le chat). | `/app/whatsapp-conversations` |

### Chiffres : aujourd'hui / ce mois

| Chiffre | Définition |
|---|---|
| Commandé | Nombre et montant (`total`) des commandes créées dans la période, statut hors `canceled` / `draft` / `archived`, payées ou non, toutes origines (site, WhatsApp, téléphone). |
| Encaissé | Ventes moins remboursements du journal de caisse sur la période : même calcul que le « chiffre d'affaires » de `summarizeMonth`, appliqué aussi au jour. |
| Caisse | Solde actuel (toutes écritures), entrées et sorties du mois (`summarizeMonth`). |
| Marge brute du mois | Identique à l'onglet Marges : chiffre d'affaires, coût, marge sur les commandes encaissées dans le mois. Si `unknown_cost_items > 0` : « N articles sans coût de revient, marge incomplète », lien vers `/app/procurement`. |
| Stock chez les livreurs | Nombre total d'articles confiés, et par livreur (`balances`, `courierTotals`). |

Hors périmètre (YAGNI, à ajouter si le besoin se confirme) : graphiques,
comparaison avec le mois précédent, actions depuis le tableau de bord,
rafraîchissement automatique.

## 2. Backend

### Route `GET /admin/dashboard`

Réponse unique, un objet par bloc. Chaque bloc est soit
`{ available: true, ... }`, soit `{ available: false }` :

```ts
{
  today: "2026-10-04",
  month: "2026-10",
  todo: {
    to_assign:        { available, count, redeliver },
    in_progress:      { available, count, late },
    courier_money:    { available, total, couriers: [{ id, name, amount, days }] },
    prospects:        { available, due, overdue, back_in_stock },
    conversations:    { available, awaiting },
  },
  figures: {
    ordered:          { available, today: { count, amount }, month: { count, amount } },
    collected:        { available, today, month },
    cash:             { available, balance, month_in, month_out },
    margin:           { available, revenue, cost, margin, orders, unknown_cost_items },
    courier_stock:    { available, total, couriers: [{ id, name, quantity }] },
  },
}
```

Chaque bloc est produit par sa propre fonction de chargement
(`src/lib/dashboard-query.ts`), qui lit les données puis délègue les calculs à
des fonctions pures (`src/lib/dashboard-rules.ts`). La route lance tous les
chargements avec `Promise.allSettled` : un bloc en échec est renvoyé
`{ available: false }` et l'erreur est journalisée (`[dashboard] <bloc> : ...`),
sans empêcher les autres. Cas typique : base du chat indisponible
(`listConversations` renvoie `null`) → seule la ligne Conversations est
« indisponible ».

### Réutilisation, sans duplication

- Prospects : `dueToday`, `sortWaiting` (`prospect-rules`) ; la disponibilité
  des variantes est calculée comme dans `GET /admin/prospects`, extraite dans
  une fonction partagée.
- Caisse : `loadAllEntries`, `summarizeMonth` (`cashbook-*`).
- Argent des livreurs : `computeSettlement` (`delivery-rules`).
- Stock livreurs : `balances`, `courierTotals` (`courier-stock-rules`).
- Chat : `listConversations` (`whatsapp-chat-db`).

Deux extractions (refactorings sans changement de comportement), pour que le
tableau de bord et les pages détaillées affichent toujours les mêmes chiffres :

1. Le calcul de « Commandes à confier » quitte
   `api/admin/deliveries/to-assign/route.ts` pour une fonction
   `loadOrdersToAssign(scope)` dans `lib/` ; la route l'appelle.
2. Le calcul de la marge du mois quitte `api/admin/margins/route.ts` pour
   `computeMonthMargin(scope, month, costs)` dans `lib/` ; la route l'appelle.

### Nouveaux calculs purs (`dashboard-rules.ts`)

- `unremittedByCourier(deliveries, validatedDays)` : groupe les livraisons
  terminées par livreur et par jour de `completed_at`, exclut les couples
  (livreur, jour) déjà validés, somme `computeSettlement(...).toRemit` ;
  renvoie `{ courier_id, amount, days }[]` (livreurs sans montant ni jour
  exclus).
- `countInProgress(deliveries, today)` : `{ count, late }`.
- `orderedTotals(orders, today, month)` : `{ today: { count, amount }, month: { count, amount } }`.
- `collectedTotals(entries, today, month)` : ventes moins remboursements du
  jour et du mois.

## 3. Admin

Page `src/admin/routes/dashboard/page.tsx`, entrée « Tableau de bord » dans le
menu latéral (`defineRouteConfig`), URL `/app/dashboard`.

- Un seul appel à `/admin/dashboard` au chargement, bouton « Actualiser ».
- En haut, « À faire aujourd'hui » : une carte par ligne (nombre en grand,
  détail, lien), grisée à 0, « indisponible » si `available: false`.
- En dessous, « Aujourd'hui / Ce mois » : cartes de chiffres.
- Éléments HTML natifs et classes utilitaires Medusa, comme les autres pages
  (conflit de types React 18/19 avec `@medusajs/ui`, voir
  `widgets/analytics-summary.tsx`). Montants formatés comme la page Caisse.
- Échec de l'appel entier : message d'erreur et bouton « Réessayer », jamais
  de « Chargement… » sans fin.

## 4. Tests

- Unitaires (TDD, `src/lib/__tests__/dashboard-rules.unit.spec.ts`) :
  argent non versé (regroupement livreur/jour, jours validés exclus, montant
  négatif, livraisons non terminées ignorées), livraisons en retard,
  commandé jour/mois (bornes de jour et de mois, annulées exclues), encaissé
  (remboursements déduits).
- Unitaires de la route (exécuteur et chargements simulés, comme
  `whatsapp-chat-db.unit.spec.ts`) : un chargement en échec donne
  `{ available: false }` sans faire échouer les autres.
- Non-régression : les tests existants passent après les deux extractions ;
  les routes `to-assign` et `margins` renvoient la même réponse qu'avant
  (comparaison sur staging avant / après).
- Vérification réelle : page en local (Playwright), puis appel de
  `/admin/dashboard` sur staging et production depuis le conteneur n8n, chiffres
  recoupés avec les pages Livraisons, Caisse, Marges, Prospects et le chat.
