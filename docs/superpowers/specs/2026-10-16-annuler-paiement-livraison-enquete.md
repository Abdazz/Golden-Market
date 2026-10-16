# Spike : « Marquer non payée » / « Marquer non livrée » (2026-10-16)

Spike jetable, base locale uniquement (backend dev :9002, Postgres `golden_market_medusa_postgres`).
Aucun fichier suivi modifié, aucun commit. Clé API secrète temporaire `apk_01M519Z97GKNRSV0NQXQYKPHRP`
créée puis révoquée et supprimée (vérifié : 0 ligne `spike-undo-tmp`). Scripts dans
`/tmp/claude-1000/-home-yulcom-web-perso-Golden-Market/5454cb5c-1826-4921-82ba-eeb6db2aebee/scratchpad/`
(`undo.ts` = prototype des deux annulations, `snap.sh` = instantané commande + caisse + stock).

## Verdict

| Bouton | Faisable proprement ? | Approche retenue |
|---|---|---|
| Marquer non payée | **Oui** | Annulation au niveau des modules (capture, transaction de commande, paiement système), dans un workflow à compensations. **Pas** de remboursement Medusa. |
| Marquer non livrée | **Oui**, avec 2 contournements Medusa | Effacer `shipped_at`/`delivered_at` du fulfillment puis `cancelOrderFulfillmentWorkflow` natif (stock + réservation), supprimer le fulfillment annulé, remettre à 0 les compteurs expédié/livré de l'article, puis remettre la livraison « Confiée ». |

Les deux ramènent la commande **exactement** à l'état d'avant (statuts, montants, stock, réservations,
solde livreur) et l'historique de la fiche commande Medusa ne garde **aucune trace**. Les seules
traces sont des lignes supprimées de façon réversible (caisse, transactions de commande, mouvements livreur)
et les anciennes versions internes de la commande (invisibles dans l'admin).

## Données de test (locales, jetables)

Commandes téléphone `SpikeUndo1..5` (variante `variant_01M1HRM74EHVNE5K70GDM64W73`, 2 500 F, article
`iitem_01M1HRM74WVY60VDFSVD5S1B7R`) :

| Commande | Scénario |
|---|---|
| O1 `order_01M519ZVKD8EFB7Y90YA24QAQT` | Livreur A, formulaire « Marquer payée » coché Livrée |
| O2 `order_01M519ZX3HD6NEJPMX0R5BV5YW` | Livreur A, `POST /admin/deliveries/:id/complete` (encaissé 2 500) -> test du remboursement |
| O3 `order_01M519ZXFD58H63YDVR84N8EH1` | Formulaire « Marquer payée » seul (non livrée) |
| O4 `order_01M51A053HRBEWA2BXRF85GKS0` | « Marquer livrée » **sans** livraison (`POST /admin/order-payments/:id/deliver`) |
| O5 `order_01M51A05E3Z1BNM0SZKD7XF20C` | Simulation commande du site en paiement à la livraison : session `pp_cash-on-delivery` autorisée, puis livraison terminée par le livreur B (capture) |

Préparation locale : stock de l'article monté de 11 à 21 (SQL), mouvement « remise » de 3 au livreur A
inséré en SQL (`cstk_spikeundo1`) car la route de remise lit le 1er emplacement de stock, ici l'entrepôt
européen de démo (bizarrerie locale). En fin de spike, les mouvements livreur du spike ont été supprimés
(réversible) ; les commandes SpikeUndo restent en local, le +10 de stock aussi.

## Q1 - « Marquer non payée »

### Comment « payée » est fait aujourd'hui

- `submitPaymentForm` (`lib/order-payment-form.ts`) : la caisse d'abord (`replaceOrderEntriesWorkflow` :
  écritures auto vente/frais de la commande supprimées de façon réversible, création de
  `order-final:<id>:sale|courier_fee|transport_fee`), puis `markOrderPaid` :
  - collecte `not_paid` (commande téléphone) -> `markPaymentCollectionAsPaid` : **crée** une session
    `pp_system_default`, l'autorise (crée un `payment`), la capture (crée une `capture` + une
    `order_transaction` `reference=capture`) ;
  - collecte `authorized` (site, paiement à la livraison) -> `capturePaymentWorkflow` (capture +
    `order_transaction`).
- `syncOrderAfterDelivery` (`lib/delivery-order-sync.ts`) fait la même chose à la fin d'une livraison
  encaissée ; dans ce cas la caisse vient des abonnés : `payment.captured` -> `capture:<capt_id>`,
  frais -> `delivery:<deliv_id>:courier_fee`.

### Comment Medusa 2.18 calcule l'état « payé »

- `payment_status` (`core-flows/dist/order/utils/aggregate-status.js`, `getLastPaymentStatus`) : dérivé
  de chaque `payment_collection` : `captured_amount`, `refunded_amount`, `status`.
- Ces champs de la collecte sont recalculés par `PaymentModuleService.maybeUpdatePaymentCollection_`
  à partir des sessions (autorisées), captures et remboursements : sans session -> `not_paid`, session
  autorisée -> `authorized`, captures >= montant -> `completed`.
- `summary.paid_total / transaction_total / pending_difference` : `order_summary.totals` de la
  **version courante** de la commande, mis à jour à l'ajout/suppression d'une `order_transaction`
  (`OrderModuleService.updateOrderPaidRefundableAmount_`).
- Encadré « Payments » et chronologie de l'admin : liste des `payments` (créé -> « en attente »,
  `captured_at` -> « capturé », `refunds` -> « remboursé », `canceled_at` -> « annulé »).

### Options évaluées

**(a) `refundPaymentWorkflow` - à écarter.** Essai sur O2 (`POST /admin/payments/:id/refund {amount:2500}`) :
```
payment_status: refunded, total: 0, paid_total: 2500, transaction_total: 0, pending_difference: 0
order_credit_line: payment_collection | 2500       <- Medusa 2.18 ajoute un avoir qui annule le total
cash: refund|out|2500|refund:ref_...               <- l'abonné payment.refunded inscrit une sortie de caisse
```
La commande affiche « Remboursée », son total tombe à 0 et la collecte reste `completed`. Puis
re-« Marquer payée » : `{"ok":true}` mais **rien ne change côté Medusa** (collecte ni `not_paid` ni
`authorized`), et la caisse garde la sortie « Remboursement » à côté de la nouvelle vente
`order-final:…:sale` -> caisse fausse. Mauvais sens métier (aucun argent n'a été rendu) et irréversible.

**(b) Annuler le paiement / la collecte - impossible.** `cancelPaymentCollectionWorkflow` sur une
collecte capturée :
```
SPIKE refused: Cannot cancel a completed payment collection
```
(`validatePaymentCollectionCancellationStep`). Et même possible, le statut serait `canceled`, pas
« Non payée ».

**(c) Annulation au niveau des modules - retenue.** Prototype `undoPaid` dans `undo.ts` :
1. transactions `order_transaction` `reference=capture` des captures -> `updateOrderTransactions({version: <version courante>})`
   puis `softDeleteOrderTransactions` (voir piège ci-dessous) ;
2. `paymentModule.deleteCaptures(captureIds)` ;
3. paiement `pp_system_default` (créé par « Marquer payée ») : `deletePayments` + `deletePaymentSessions`
   de la session système ; paiement d'un autre fournisseur (paiement à la livraison du site) :
   `updatePayments({id, captured_at: null})` (le paiement et la session autorisée restent) ;
4. `paymentModule.maybeUpdatePaymentCollection_(pc.id)` -> statut recalculé ;
5. caisse : suppression réversible de `order-final:<id>:*` et des ventes auto `capture:*`.

Résultats observés (`GET /admin/orders/:id`) :
```
O3 (formulaire, non livrée)  avant : captured  completed  paid 2500 pending 0
                             après : not_paid  not_paid   paid 0    pending 2500   pays: []   <- identique à la création
O5 (site, paiement livraison) avant : captured  completed
                             après : authorized authorized  paid 0 pending 2500, payment cap_at=false  <- identique à avant capture
O1 (formulaire + livrée)     après : not_paid, pending 2500 (après correction de version, voir piège)
```
Ré-enchaînement vérifié : O3 re-marquée payée par le formulaire -> `captured`, nouvelle vente
`order-final:…:sale` créée (l'index unique de référence est partiel `deleted_at IS NULL`, la ligne
supprimée ne gêne pas). O5 re-livrée -> nouvelle capture, nouvelles écritures `capture:` et
`delivery:…:courier_fee`.

**Piège Medusa trouvé (O1)** : `updateOrderPaidRefundableAmount_` met à jour le résumé de la
**version de la transaction**, pas la version courante. O1 a été payée en version 1 puis livrée
(versions 2, 3, 4) : la suppression de la transaction a modifié le résumé v1 et laissé le résumé
courant v4 à `paid_total 2500 / pending_difference 0` (commande « non payée » mais rien à payer).
Contournement validé : passer la transaction à la version courante (`updateOrderTransactions`) avant
de la supprimer -> résumé v4 `paid 0 / pending 2500`. À faire systématiquement (une commande payée
puis livrée change toujours de version).

**(d) Autres** : une transaction négative compensatoire afficherait un « remboursé » ; une mise à jour
SQL directe contourne les modules sans gain. Non retenues.

## Q2 - « Marquer non livrée »

### Ce que la livraison crée (observé sur O1)

```
fulfillment : packed + shipped + delivered ; order_item (nouvelle version à chaque étape) : fulfilled 1 / shipped 1 / delivered 1
stock (inventory_level Ouaga) : stocked 21 -> 20, reserved 13 -> 12, réservation de la ligne supprimée
courier_stock_movement : type delivery, -1 (solde livreur 3 -> 2)
delivery : status delivered, completed_at, amount_collected 2500, courier_fee 1000
caisse : frais (order-final:…:courier_fee si formulaire, sinon delivery:<id>:courier_fee)
```

### Ce que Medusa refuse

- `cancelOrderFulfillmentWorkflow` (`core-flows/dist/order/workflows/cancel-order-fulfillment.js`,
  `cancelOrderFulfillmentValidateOrder`) : `"The fulfillment has already been shipped. Shipped fulfillments cannot be canceled"`.
- Module fulfillment (`FulfillmentModuleService.canCancelFulfillmentOrThrow`) : refuse `shipped_at`
  **ou** `delivered_at`.
- `deleteFulfillment` : seulement un fulfillment déjà annulé.
- Module commande : pas d'action « dé-expédier / dé-livrer » (seulement `CANCEL_ITEM_FULFILLMENT`, qui
  ne baisse que `fulfilled_quantity`).

### Contournement validé (`undoDelivered` dans `undo.ts`)

1. `fulfillmentModule.updateFulfillment(id, { shipped_at: null, delivered_at: null })` -> les deux
   contrôles tombent ;
2. `cancelOrderFulfillmentWorkflow` natif : remet le stock (`adjustInventoryLevels +1`), recrée la
   réservation de la ligne, baisse `fulfilled_quantity`, marque le fulfillment annulé ;
3. option « effacer » : `link.dismiss(order <-> fulfillment)` + `fulfillmentModule.deleteFulfillment` ;
4. `orderModule.updateOrderItems({ id: <order_item version courante>, shipped_quantity: 0, delivered_quantity: 0 })` ;
5. livraison : mouvements `delivery` du livreur supprimés (réversible ; l'index unique est partiel
   `deleted_at IS NULL`, donc un nouveau déstockage reste possible), `delivery` -> `status assigned,
   completed_at/amount_collected/courier_fee/transport_fee/sync_warning = null`, écritures
   `delivery:<id>:*` supprimées (réversible).

Résultats :
```
O1 sans effacement : fulfillment_status "canceled" (fulfillment annulé visible), stock 19/11 -> 20/12, solde livreur 1 -> 2, réservation 1
O4 (livrée sans livraison) avec effacement : delivered -> not_fulfilled, ful: [], stock 18/10 -> 19/11  (= avant « Marquer livrée »)
O5 (site + livreur B) payé+livré -> annulé : authorized / not_fulfilled / delivery assigned / stock 18/10 -> 19/11, frais et vente supprimés
```

Ré-enchaînement :
- **Sans effacement, re-livrer casse** (O1) : `"Statut « Fulfillment » non mis à jour : Cannot create shipment for a canceled fulfillment"`
  car `syncOrderAfterDelivery` prend `order.fulfillments[0]` sans filtrer les annulés. Correctif
  nécessaire (filtrer `canceled_at`) **ou** supprimer le fulfillment annulé.
- Avec effacement : O1 re-livrée (`/deliver`) -> nouveau fulfillment livré, stock 20/12 -> 19/11 ;
  O5 re-terminée -> tout recréé (capture, frais, fulfillment). Cycle complet OK.
- Sans la remise à 0 de `shipped_quantity`, une nouvelle expédition échouerait (`ship-item.js` :
  « Cannot ship more items than what was fulfilled », car `fulfilled - shipped` = 0).

**Piège stock (local, à vérifier en prod)** : la création déstocke à l'emplacement de la
**réservation** (Ouaga), l'annulation restocke à `fulfillment.location_id`. En local les commandes
téléphone prennent l'option de livraison de démo « Standard Shipping » (entrepôt européen, la route
`phone-orders` prend la première option) -> `"Inventory level … location sloc_…European… not found"`.
Contourné dans le spike en remettant `location_id` sur Ouaga avant l'annulation. En production
(boutique mono-région, une seule option) le cas ne devrait pas se produire, mais le code doit vérifier
que `fulfillment.location_id` a un niveau de stock pour l'article, sinon utiliser l'emplacement unique
du dépôt (comme `loadStockItems`) et sinon refuser.

### Rapports livreur

`delivery_report.status = validated` resterait collé à une livraison redevenue « Confiée » :
`submitLocked` refuse (`Ce rapport est déjà traité`) et `validateLocked` exige `submitted`. À la
remise en « Confiée », supprimer le rapport (comme `deliveries/[id]/reassign`) ou le passer en
`returned` avec `return_reason` « Annulé par l'équipe » (le livreur peut renvoyer un rapport).
Recommandé : `returned`, le livreur voit pourquoi.

### Versement du livreur

`computeSettlement` additionne les livraisons terminées du jour (`completed_at`). Si
`courier_settlement` existe pour `(courier_id, dayOf(completed_at))`, annuler fausserait un versement
validé -> **refuser** (même message que `submitPaymentForm` : « Journée du livreur déjà validée :
rouvrez-la… »). Même contrôle pour « non payée » quand la livraison terminée porte `amount_collected > 0`.

## Q3 - Règle des 24 h

- « Payée » : `order-final:<id>:sale` (date réécrite à chaque soumission, `payment-edit-rules.ts`)
  **ne suffit pas** : une commande payée par la fin de livraison (`/deliveries/:id/complete`, O2 et O5)
  ou par le bouton natif n'a **que** `capture:<capt_id>`. Échéance = la plus récente de :
  date de `order-final:<id>:sale` et `captures.created_at` (ou `payment.captured_at`) des paiements non
  remboursés. Lire les captures via la collecte (comme `recordPaymentEntries`).
- « Livrée » : `delivery.completed_at` de la dernière livraison `delivered|shipped` ; sans livraison
  (O4, « Marquer livrée » de la fiche) le seul horodatage est `fulfillment.delivered_at`
  (observé `2026-10-16 02:57:15.907+00`), ou `shipped_at` pour une expédition. Échéance = max de
  `delivery.completed_at` et `fulfillment.delivered_at ?? shipped_at` des fulfillments non annulés.
- Calcul côté serveur (GET qui renvoie `undo_until`) et revérifié au POST, réutiliser
  `paymentEditStatus` (limite incluse).

## Q4 - Ce que montre la fiche commande ensuite

| Approche | Résumé | Encadré Payments | Fulfillment | Chronologie |
|---|---|---|---|---|
| (a) remboursement | « Remboursée », total 0 (avoir) | paiement capturé + remboursement | inchangé | « capturé », « remboursé » |
| (c) non payée, commande téléphone | « Non payée », reste à payer = total | vide (comme à la création) | inchangé | rien |
| (c) non payée, site paiement à la livraison | « Autorisée » | paiement en attente (comme avant capture) | inchangé | « paiement en attente » (existait déjà) |
| non livrée sans effacement | badge « Annulé » | - | fulfillment annulé visible | « créé », « annulé » |
| **non livrée avec effacement** | « Non traitée » | - | aucun | rien |

La chronologie de l'admin (`dashboard/dist/order-detail-*.mjs`) est construite à partir des
`payments`/`refunds` et des `fulfillments`, plus les order_changes de type edit/claim/exchange/return/
transfer/update_order seulement : les changements internes de fulfillment/expédition/livraison (type
vide) n'y apparaissent pas. Avec (c) + effacement, **aucune trace visible** ; la trace d'audit reste
en base (lignes supprimées réversibles de caisse, transaction de commande, mouvements livreur ; anciennes
versions `order_item`/`order_summary`). Si le propriétaire veut une trace visible, écrire une ligne dans
`order.metadata` (ex. `undo_log`) ou une note : recommandé, peu coûteux.

## Q5 - Conception recommandée

### « Marquer non payée »

- Route `POST /admin/order-payments/:order_id/unpay` ; `GET /admin/order-payments/:order_id` renvoie
  `unpay_until` (bouton visible seulement si non expiré).
- Workflow `unmarkOrderPaidWorkflow` (verrou `complete-delivery:<delivery_id>` ou par commande), étapes
  avec compensation :
  1. contrôles : collecte payée, aucun remboursement, fenêtre 24 h, journée du livreur non validée si la
     livraison terminée porte `amount_collected > 0` ;
  2. caisse : suppression réversible de `order-final:<id>:sale` et des ventes `capture:*` (compensation
     `restoreCashEntries`). Les frais : garder ceux de la livraison si elle reste livrée (voir ci-dessous) ;
  3. transactions : passage à la version courante puis `softDeleteOrderTransactions` (compensation
     `restoreOrderTransactions` + version d'origine) ;
  4. paiement : `deleteCaptures`, puis `pp_system_default` -> `deletePayments` + `deletePaymentSessions`,
     autre fournisseur -> `captured_at: null` ; `maybeUpdatePaymentCollection_` (méthode non publique :
     l'encapsuler dans une étape, ou mettre à jour la collecte avec `updatePaymentCollections`
     `{status, captured_amount: 0, authorized_amount, completed_at: null}`). Compensation : recréer à
     l'identique est lourd -> mettre cette étape **en dernier**, sans compensation, comme Medusa le fait
     pour `cancelFulfillmentWorkflow` ;
  5. livraison terminée et encaissée par le livreur : `amount_collected: 0` (le livreur n'a rien à
     reverser) via `updateDeliveryWorkflow`.
- Frais de caisse : si la commande reste livrée, les frais `order-final:…:courier_fee|transport_fee`
  sont réels (la course a eu lieu). Le plus simple : les laisser. Si elle n'est pas livrée, les
  supprimer aussi (réversible).
- Fichiers : `lib/order-payment-form.ts` (ou nouveau `lib/order-undo.ts`), `workflows/order-undo.ts`
  + étapes, `api/admin/order-payments/[order_id]/unpay/route.ts`, `lib/payment-edit-rules.ts`
  (échéance capture), `admin/widgets/order-payment-recorded.tsx` (bouton + confirmation).
- Tests : unitaires sur la règle d'échéance (formulaire vs capture vs fenêtre dépassée) ; intégration
  HTTP : téléphone -> payée -> non payée -> `payment_status not_paid, pending_difference = total,
  payment_collections[0].payments = []`, re-payée OK ; site autorisé -> capturé -> `authorized` ;
  commande payée puis livrée (changement de version) -> `pending_difference = total` ; remboursement
  existant -> 400 ; journée validée -> 400 ; > 24 h -> 400.

### « Marquer non livrée »

- Route `POST /admin/order-payments/:order_id/undeliver` ; `undeliver_until` dans le GET.
- Workflow `unmarkOrderDeliveredWorkflow`, verrou `complete-delivery:<delivery_id>` **et** le verrou
  `courier-stock` (mouvements livreur) :
  1. contrôles : fenêtre 24 h, journée du livreur non validée, aucun retour/échange Medusa ouvert,
     `fulfillment.location_id` a un niveau de stock (sinon emplacement du dépôt, sinon refus) ;
  2. livraison -> `assigned` (`updateDeliveryStep` existant, compensé) en gardant `tour_date` (ou la
     remettre à aujourd'hui pour qu'elle réapparaisse dans la tournée du jour : à choisir avec le
     propriétaire), rapport -> `returned` ;
  3. mouvements `delivery` supprimés (réversible, compensation `restore`) : le solde du livreur
     remonte, ne peut pas devenir négatif ;
  4. écritures `delivery:<id>:*` supprimées (réversible) ;
  5. fulfillment : `updateFulfillment(shipped_at/delivered_at null)` puis
     `cancelOrderFulfillmentWorkflow.runAsStep` (stock + réservation, natif), puis `updateOrderItems`
     (shipped/delivered à 0), puis `dismiss` + `deleteFulfillment` **en dernier** (pas de compensation).
- Correctif indispensable même sans effacement : `lib/delivery-order-sync.ts` doit ignorer les
  fulfillments annulés (`fulfillments.canceled_at`) ; idem `paymentFormDefaults.delivered` (déjà filtré).
- Fichiers : `lib/delivery-order-sync.ts`, nouveau workflow + étapes, route `undeliver`,
  `admin/widgets/order-delivery.tsx` / `order-payment-recorded.tsx`, `lib/courier-reports.ts`
  (rapport renvoyé).
- Tests : intégration : phone -> confiée -> livrée (formulaire) -> non livrée : `fulfillment_status
  not_fulfilled`, `fulfillments []`, stock et réservation revenus, solde livreur revenu, livraison
  `assigned` ; re-livrée OK (nouveau fulfillment, nouveau déstockage) ; « Marquer livrée » sans
  livraison -> non livrée ; journée validée -> 400 ; > 24 h -> 400 ; expédition `shipped`.

### Risques

- **Stock bloqué / faux** : emplacement du fulfillment sans niveau de stock (vu en local) -> le
  workflow échoue (pas de dégât, transaction annulée) ; contrôle en amont. Annuler deux fois : verrou +
  contrôle « fulfillment non annulé ».
- **Double ligne de caisse** : évitée par les références uniques partielles ; ne jamais créer
  d'écriture négative compensatoire. Le remboursement natif (bouton Medusa « Rembourser ») reste
  dangereux : le refuser pour les commandes sans paiement en ligne serait un plus.
- **Solde livreur négatif** : impossible dans ce sens (on retire une sortie) ; mais si le livreur a
  rendu l'article au dépôt entre-temps (« retour »), le solde remonterait à tort -> afficher le solde
  et laisser une correction manuelle.
- **Versement déjà validé** : refus obligatoire (les deux boutons).
- **Résumé de commande faux** : piège de version ci-dessus, test d'intégration dédié.
- **Mise à jour Medusa** : on dépend de méthodes de module (`deleteCaptures`, `updateOrderItems`,
  `maybeUpdatePaymentCollection_` non publique) et du comportement du résumé par version : épingler un
  test d'intégration qui casse si Medusa change.
- **Notifications** : `no_notification` déjà utilisé ; les annulations n'émettent que
  `order.fulfillment_canceled` (aucun abonné ici).
- Ordre des boutons : « non payée » puis « non livrée » sont indépendants ; « non livrée » d'une
  livraison encaissée garde le paiement (la commande reste payée, la livraison est re-confiée).

### Estimation

- Non payée : ~1 jour (workflow, route, règle d'échéance, bouton, tests).
- Non livrée : ~1,5 à 2 jours (workflow plus long, correctif `delivery-order-sync`, rapport, tests de stock).
- Total ~3 jours avec revue et vérification navigateur.

Aucun des deux n'est infaisable. Repli si le propriétaire refuse de dépendre des contournements Medusa
pour la livraison : garder le fulfillment annulé visible (pas d'effacement) mais **corriger
`delivery-order-sync`** pour ignorer les fulfillments annulés ; la fiche affiche alors « Annulé » en
historique, ce qui reste exact.
