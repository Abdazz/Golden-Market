# Prospects à relancer — design (sous-projet 4 du mini-SaaS de gestion)

## Contexte

Dans `management/Journal de caisse-2026.xlsx`, chaque feuille produit
(« Commandes Balai-Eponge », « Commandes de SEAU »…) liste des numéros
WhatsApp avec un statut (« Livré », **« A relancer »**) et un commentaire
(« à relancer le jeudi »…), et une feuille **« Clients en attente du kit »**
recense les clients qui attendent un produit en rupture de stock.

Le 2026-09-28, le propriétaire a demandé d'enchaîner les modules en prenant
les décisions lui-même absent : choix ci-dessous = **hypothèses à valider**.

## Objectif

Ne plus perdre de vente faute de relance : une liste des personnes à
recontacter **aujourd'hui**, des clients qui attendent un produit revenu en
stock, et un suivi simple (relancé, converti, perdu).

## 1. Données — module `prospects`

**Prospect (`prospect`)** : `phone` (normalisé `+226…`), `name`, `variant_id`
(produit d'intérêt, facultatif), `product_label` (texte libre si pas de
variante), `status` : `to_follow_up` (à relancer), `waiting_stock` (attend un
produit en rupture), `converted` (a commandé), `lost` (abandonné) ;
`follow_up_on` (date de la prochaine relance, `AAAA-MM-JJ`),
`last_contacted_at`, `follow_up_count`, `note`, `order_id` (commande qui l'a
converti).

## 2. Comportements

- **Ajout** manuel (numéro, nom, produit, statut, date de relance — demain par
  défaut) ; un numéro déjà suivi et actif n'est pas dupliqué (fiche existante
  mise à jour).
- **« Relancé »** : `last_contacted_at` = maintenant, compteur + 1, prochaine
  relance dans **3 jours** (modifiable).
- **« Perdu »** / **« Remettre à relancer »**.
- **Conversion automatique** : quand une commande est passée (`order.placed`)
  avec le numéro d'un prospect actif, il passe `converted` avec la commande.
- **Retour en stock** : un prospect `waiting_stock` dont la variante est de
  nouveau disponible apparaît en tête avec « De nouveau disponible — à
  prévenir ».
- Liens directs : conversation dans l'admin (`/app/whatsapp-conversations
  ?phone=`), WhatsApp (`wa.me`), fiche produit.

## 3. Écran « Prospects » (admin, téléphone compris)

Onglets : **À relancer aujourd'hui** (date ≤ aujourd'hui, retards en rouge),
**En attente de stock** (disponibles en premier), **Tous** (recherche par
numéro ou nom, filtre statut). Formulaire d'ajout / modification.

## 4. Hypothèses (à valider)

1. Délai de relance par défaut : 3 jours après une relance, 1 jour à l'ajout.
2. Relance faite par le propriétaire lui-même (WhatsApp ou admin) : l'outil ne
   l'envoie pas automatiquement (un message hors 24 h exige un modèle Meta).
3. Pas d'import des anciennes listes Excel.
4. Conversion = n'importe quelle commande passée avec le même numéro.

## 5. Tests

Unitaires : normalisation, dates de relance, sélection « à relancer
aujourd'hui », conversion par numéro, retour en stock ; local : écran complet ;
staging puis production.

## Non-objectifs

Relances automatiques par WhatsApp, création automatique de prospects depuis
les conversations de l'agent, import Excel.
