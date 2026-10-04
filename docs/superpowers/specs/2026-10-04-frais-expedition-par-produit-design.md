# Frais d'expédition par produit — design

## Contexte

Toutes les commandes (site, agent WhatsApp `place_order`, commandes par téléphone) passent
par une seule option de livraison Medusa, « Livraison — à convenir avec le marchand », à 0 F
fixe (`scripts/seed-region-bf.ts`). Les frais d'expédition hors Ouagadougou ne figurent donc
jamais dans la commande : le 2026-10-03, un client de Kaya a payé 9 500 F + 1 500 F
d'expédition, sa commande affiche 9 500 F (caisse et marges faussées), et l'agent ne
connaissait pas les frais. Correctif provisoire du 2026-10-04 : « 1 500 F pour le balai-éponge »
écrit dans la consigne de l'agent.

Décisions du propriétaire (2026-10-04) :

- les frais d'expédition hors Ouagadougou **dépendent du produit** ;
- plusieurs produits : **un seul colis, on prend les frais les plus élevés** ;
- Ouagadougou : livraison **gratuite** ;
- produit sans frais saisis : **montant par défaut 1 500 F**.

## Objectif

Les frais d'expédition sont calculés automatiquement et inclus dans le total de chaque
commande, quel que soit le canal, à partir d'un champ saisi sur chaque produit dans l'admin.

## 1. Règle de calcul (`src/lib/shipping-fee-rules.ts`, fonctions pures)

- `isOuagadougou(city)` : même règle que `defaultTypeForCity` des livraisons (ville vide ou
  commençant par « ouaga », casse et espaces ignorés) — réutilise cette fonction.
- `productShippingFee(metadata)` : `metadata.frais_expedition_xof` si c'est un entier ≥ 0
  (nombre ou chaîne de chiffres), sinon `DEFAULT_SHIPPING_FEE_XOF` (1 500).
- `computeShippingFee({ city, products })` : 0 si Ouagadougou ou si `products` est vide ;
  sinon le maximum de `productShippingFee` sur les produits du panier (la quantité ne compte
  pas).

## 2. Saisie des frais (admin)

Widget `product.details.side.after` « Frais d'expédition (hors Ouagadougou) » sur la fiche
produit : champ montant en F CFA, bouton Enregistrer, texte « Vide : 1 500 F par défaut ».
Enregistre `metadata.frais_expedition_xof` via la route native `POST /admin/products/:id`, en
renvoyant toutes les métadonnées existantes (aucune clé perdue) ; champ vidé → clé retirée
(valeur par défaut). Montant refusé s'il n'est pas un entier ≥ 0.

## 3. Calcul dans Medusa : fournisseur de livraison `golden-market-shipping`

- Module fournisseur `src/modules/golden-market-shipping/` (service étendant
  `AbstractFulfillmentProviderService`, identifiant `golden-market-shipping`), enregistré dans le
  module fulfillment de `medusa-config.ts` à côté de `manual`.
- `canCalculate` → vrai ; `calculatePrice(optionData, data, context)` : lit
  `context.shipping_address.city` et les `product_id` de `context.items`, charge les
  métadonnées des produits par Query (conteneur global `@medusajs/framework`, le conteneur du
  fournisseur ne donne pas accès au module produit), applique `computeShippingFee`, renvoie
  `{ calculated_amount, is_calculated_price_tax_inclusive: true }`. Lecture en échec → montant
  par défaut 1 500 F hors Ouagadougou (ne jamais bloquer une commande), erreur journalisée.
- Autres méthodes (`validateFulfillmentData`, `createFulfillment`, `cancelFulfillment`,
  `createReturnFulfillment`, `getFulfillmentOptions`) : comportement du fournisseur manuel
  (aucun service externe).
- Medusa recalcule une option calculée quand le panier change (`refreshCartShippingMethods`).

**Script one-shot idempotent** `src/scripts/setup-calculated-shipping.ts` (`npm run
setup:calculated-shipping`) : dans la zone de service BF, crée l'option « Livraison » (
`price_type: calculated`, fournisseur `golden-market-shipping`, même profil de livraison) si
elle n'existe pas, puis supprime l'option « Livraison — à convenir avec le marchand ». Une seule
option reste (n8n prend la première). Les commandes passées ne changent pas. Prérequis : le
fournisseur doit être lié à l'emplacement de stock (`stock_location` ↔ `fulfillment_provider`),
fait par le script.

## 4. Effets par canal

| Canal | Effet |
|---|---|
| Site | L'étape Livraison du checkout affiche le montant calculé (le starter appelle déjà `/store/shipping-options/:id/calculate` pour les options `calculated`) ; le total inclut l'expédition. |
| WhatsApp `place_order` | Workflow inchangé côté panier (frais ajoutés automatiquement). `Format Result` renvoie en plus `shipping_total` et le total frais compris ; la consigne de l'agent annonce le total frais compris avant le paiement. |
| Agent, avant commande | `find_products` / `search_products_semantic` / `browse_catalog` renvoient les frais d'expédition hors Ouagadougou de chaque produit (métadonnée, défaut 1 500 F) ; la règle « 1 500 F pour le balai-éponge » est retirée de la consigne, remplacée par : frais hors Ouagadougou = ceux indiqués par l'outil, le plus élevé si plusieurs produits, gratuit à Ouagadougou. |
| Téléphone | `POST /admin/phone-orders` calcule le montant de livraison avec `computeShippingFee` (ville saisie, produits commandés) au lieu du prix fixe de l'option. |

Gestion : le total de commande inclut l'expédition, donc le montant à encaisser par le livreur,
la vente du journal de caisse et le reste dû sont justes. Les frais payés par le propriétaire à
la compagnie restent saisis sur la livraison (`transport_fee`), sans changement.

## 5. Tests

- Unitaires (TDD) de `shipping-fee-rules` : Ouagadougou (variantes d'écriture), autre ville,
  maximum de plusieurs produits, valeur par défaut, valeur invalide (négative, texte, décimale),
  panier vide, ville vide.
- Unitaires du fournisseur : `calculatePrice` avec une lecture produit simulée (montant, et
  repli sur 1 500 F si la lecture échoue).
- Unitaire de la route téléphone : montant de livraison calculé transmis à la commande.
- Réel sur staging : script, panier du site vers Kaya (montant affiché et total), `place_order`
  depuis n8n de staging si disponible sinon panier par l'API store, commande par téléphone ;
  puis production (script, vérification d'un panier, sans commande réelle).

Hors périmètre : affichage des frais sur la page produit du site, frais différents selon la
ville de destination, frais de livraison à Ouagadougou.
