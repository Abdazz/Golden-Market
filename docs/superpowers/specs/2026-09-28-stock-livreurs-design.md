# Stock confié aux livreurs — design

## Contexte

Au lieu de venir chercher les produits à chaque commande, un livreur garde
un petit stock de plusieurs produits. Le propriétaire veut savoir à tout
moment combien il reste de chaque produit chez chaque livreur.

Décisions validées avec le propriétaire le 2026-09-28 :

- **Stock Medusa = stock total possédé** (dépôt + livreurs). Remettre ou
  reprendre des produits à un livreur ne change pas le stock Medusa ; il
  baisse à la livraison comme aujourd'hui (fulfillment créé à « Livrée »).
  Raison : la réservation de stock à la commande (site, agent WhatsApp,
  commande par téléphone) refuse une commande si le stock Medusa ne couvre
  pas la quantité ; sortir le stock du dépôt à la remise aurait bloqué la
  vente des produits détenus par les livreurs.
- **Déstockage automatique si disponible** : à « Livrée » (ou « Déposée à
  la gare »), le stock du livreur baisse des articles de la commande qu'il
  détient ; le reste est considéré pris au dépôt. Jamais de stock négatif.

## 1. Données — module `delivery`

**Mouvement de stock livreur (`courier_stock_movement`)** :
`courier_id`, `inventory_item_id` (article physique Medusa), `quantity`
(entier signé, jamais 0), `type` : `handover` (remise, +), `return` (retour
au dépôt, −), `delivery` (livraison, −, automatique), `adjustment`
(correction après comptage, ±) ; `delivery_id` et `order_id` (mouvements
`delivery`), `note`, `created_at`.

- Solde d'un livreur pour un article = somme de ses mouvements.
- Index unique partiel sur (`delivery_id`, `inventory_item_id`) quand
  `delivery_id` est renseigné : une livraison ne déstocke qu'une fois
  (idempotence, double clic sur « Livrée »).
- On suit l'**article physique** (`inventory_item`) : un kit « Balai +
  seau » déstocke un balai et un seau, comme Medusa le fait pour le dépôt
  (`variant.inventory_items[].required_quantity`).

## 2. Règles

- **Remise** : quantité > 0, au plus le stock au dépôt calculé
  (stock Medusa `stocked_quantity` − total chez les livreurs). Plusieurs
  articles en une saisie.
- **Retour** : quantité > 0, au plus le solde du livreur.
- **Correction** : on saisit la quantité **réellement comptée** chez le
  livreur ; le mouvement = compté − solde. L'écart est une perte (ou une
  trouvaille) : le stock Medusa est ajusté du même écart (le propriétaire
  possède moins, ou plus). Note obligatoire.
- **Livraison** (`delivered` ou `shipped`) : pour chaque article physique
  de la commande (quantité commandée × `required_quantity`), le livreur de
  la livraison déstocke `min(besoin, solde)`. Rien si le solde est nul.
  Un échec de livraison ne bouge rien (le produit reste chez le livreur).
  Non bloquant : une erreur est journalisée, la livraison reste terminée.
- Pas d'annulation automatique si une livraison est rouverte : une
  correction manuelle suffit (cas rare).

## 3. API admin

- `GET /admin/courier-stock` : pour chaque article en stock Medusa (tous les
  `inventory_item`, le catalogue est petit), libellé produit/variante, stock Medusa, total
  livreurs, dépôt calculé, solde par livreur actif.
- `POST /admin/courier-stock/movements` : `{ courier_id, type: handover |
  return | adjustment, lines: [{ inventory_item_id, quantity }], note }`
  (pour `adjustment`, `quantity` = quantité comptée). Tout ou rien (workflow
  avec compensation).
- `GET /admin/courier-stock/movements?courier_id=` : historique, les plus
  récents d'abord, avec le numéro de commande des mouvements `delivery`.
- La réponse de « Livrée » (`POST /admin/deliveries/:id/complete`) indique
  ce qui a été pris dans le stock du livreur.

## 4. Écran — page « Livraisons », onglet « Stock livreurs »

- Tableau : une ligne par produit, colonnes **Au dépôt**, une par livreur
  actif, **Total** ; produits détenus par au moins un livreur en premier.
- Boutons **Remettre**, **Retour**, **Corriger** : choix du livreur, lignes
  produit + quantité (recherche par nom), note.
- **Historique** d'un livreur : date, type, produit, quantité, commande.
- Après « Livrée » dans la tournée : « Pris dans le stock de X : … »
  ou rien si tout vient du dépôt.
- Composant séparé (`src/admin/components/courier-stock-tab.tsx`) : la page
  des livraisons dépasse déjà 790 lignes.

## 5. Tests

Unitaires (règles pures `src/lib/courier-stock-rules.ts`) : soldes, dépôt
calculé, décomposition des kits, déstockage `min(besoin, solde)`, validation
des remises/retours/corrections, écart de correction. Local : parcours
complet sur une vraie commande (remise, livraison, historique, correction).
Staging puis production.

## Non-objectifs

Emplacements de stock Medusa par livreur, stock visible par le livreur
(pas de compte), inventaire tournant planifié, valorisation du stock
livreur en francs.
