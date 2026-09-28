# Journal de caisse — design (sous-projet 2 du mini-SaaS de gestion)

## Contexte

Le propriétaire tient sa caisse dans `management/Journal de caisse-2026.xlsx`,
feuille « Journal de caisse » : colonnes Date, Client, Quantité, Désignation,
**Entrée** (montant de la vente), **Sortie** (frais de livraison ou
d'expédition, achats d'unités), **Solde** cumulé, Commentaire, plus une feuille
« Stats » (chiffre d'affaires par mois, formules cassées `#REF!`).

Décision du propriétaire (2026-09-27) : remplacer ces fichiers par des écrans
dans l'admin Medusa, sous-projet par sous-projet. Le 2026-09-28, il a demandé
d'enchaîner les modules en attente en **prenant les décisions lui-même absent**
(« Prends les meilleures décisions toi-même ») : les choix ci-dessous sont des
**hypothèses à valider** par lui (section « Hypothèses »).

## Objectif

Savoir à tout moment combien d'argent il y a en caisse, d'où il vient et où il
part, et voir le chiffre d'affaires du mois, **sans ressaisir** ce que Medusa
connaît déjà (ventes encaissées, frais de livraison).

## 1. Données — module `cashbook`

**Écriture (`cash_entry`)** :
- `date` (dateTime), `direction` : `in` (entrée) | `out` (sortie), `amount`
  (entier F CFA, toujours positif) ;
- `category` : `sale` (vente encaissée), `refund` (remboursement),
  `courier_fee` (frais livreur), `transport_fee` (frais compagnie de
  transport), `purchase` (achat de marchandises), `advertising` (publicité),
  `opening_balance` (solde initial), `other_in` / `other_out` (divers) ;
- `label` (texte affiché), `note` (facultatif) ;
- `source` : `auto` | `manual` ; `reference` (texte, ex. `payment:pay_…`,
  `delivery:deliv_…:courier_fee`) **unique** quand renseignée : une écriture
  automatique n'est jamais créée deux fois ;
- `order_id` (facultatif, pour le lien vers la commande).

**Solde** = Σ entrées − Σ sorties (le solde initial est une entrée).

## 2. Écritures automatiques

| Événement | Écriture |
|---|---|
| `payment.captured` (livraison marquée livrée, « Marquer comme payé », paiement en ligne) | entrée `sale`, montant du paiement capturé, libellé « Vente commande 20260928001 », date de capture |
| `payment.refunded` | sortie `refund`, montant remboursé |
| Livraison terminée (Livrée / Échec / Déposée) avec frais livreur | sortie `courier_fee` « Frais livreur Gildas – commande N » |
| idem avec frais compagnie | sortie `transport_fee` « Frais STAF – commande N » |

Tolérant : un échec d'écriture automatique n'empêche jamais le paiement ou la
livraison (journalisé). Idempotent via `reference`.

Pas de reprise des anciennes données Excel (les commandes de production
antérieures étaient toutes des tests) : le propriétaire saisit un **solde
initial** le jour du démarrage.

## 3. Écran « Caisse » (admin, utilisable sur téléphone)

- En-tête : **Solde actuel**, entrées et sorties du mois choisi, chiffre
  d'affaires du mois (Σ `sale` − Σ `refund`).
- Sélecteur de mois (mois courant par défaut).
- Liste des écritures du mois (plus récentes en haut) : date, libellé,
  catégorie, montant (+ vert / − rouge), lien vers la commande si présente,
  solde après écriture.
- Bouton **« Nouvelle écriture »** (formulaire : entrée/sortie, catégorie,
  montant, date — aujourd'hui par défaut —, libellé, note) ; les écritures
  manuelles se modifient et se suppriment, les automatiques non (elles suivent
  leur source).
- Bloc **« Chiffre d'affaires par mois »** : 12 derniers mois (tableau simple :
  mois, ventes, dépenses, résultat).

## 4. Hypothèses (à valider par le propriétaire)

1. Une vente entre en caisse **au moment de l'encaissement** (paiement capturé),
   pas à la commande.
2. Les frais de livraison sont des **sorties de caisse** au moment où la
   livraison est terminée (le livreur les prélève sur l'argent encaissé).
3. Catégories de dépenses : achats de marchandises, publicité, divers ; ajout
   d'autres catégories possible plus tard.
4. Un seul journal (pas de séparation espèces / Orange Money / Moov Money).

## 5. Erreurs et cas limites

- Montant ≤ 0 ou non entier → refus clair.
- Écriture automatique en double (événement rejoué) → ignorée (`reference`).
- Suppression d'une écriture automatique → refusée.
- Livraison rouverte / modifiée : pas d'effet (les livraisons terminées ne se
  modifient pas).

## 6. Tests

- Unitaires : calcul du solde et des totaux par mois, validation des saisies,
  construction des écritures automatiques (vente, remboursement, frais),
  idempotence.
- Local : écran Caisse (saisie, modification, suppression, mois), vente
  automatique via « Marquer comme payé », frais via livraison terminée.
- Staging puis production.

## Non-objectifs

- Rapprochement bancaire / Mobile Money, multi-caisses.
- Import des anciens fichiers Excel.
- Marges par produit (sous-projet 3 « Approvisionnement et marges »).
