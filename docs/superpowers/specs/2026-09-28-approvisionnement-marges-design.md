# Approvisionnement et marges — design (sous-projet 3 du mini-SaaS de gestion)

## Contexte

Le propriétaire calcule ses prix de revient et ses marges dans
`management/Répertoir des commandes.xlsx` (feuilles « Sourcing » : commandes
envisagées, et « Commandes confirmées »). Colonnes : Désignation, Quantité,
**P. U. A.** (prix unitaire d'achat en dollars, Alibaba), **Intern Freight**
(fret international en dollars), **P. T. Achat**, **Transport** (F CFA),
**Pub** (dollars), **P. R. total**, **P. R. unitaire**, **P. V. U. détail / gros**,
marges brutes unitaire / totale et pourcentages. Paramètres en tête de feuille :
**taux de conversion 670** F CFA pour 1 dollar, **frais de transaction 2,99 %**.

Formules reconstituées et vérifiées sur ses lignes (ex. « Détendeur musculaire »,
20 × 1,32 $, transport 6 000 F, pub 36 $ → P. R. total 48 336,87 F) :

- P. T. Achat ($) = (quantité × P. U. A. + fret) × (1 + frais de transaction)
- P. R. total (F) = (P. T. Achat + pub) × taux + transport
- P. R. unitaire = P. R. total / quantité
- Marge brute unitaire = prix de vente − P. R. unitaire ; % = marge / P. R. unitaire

Le 2026-09-28, le propriétaire a demandé d'enchaîner les modules en prenant les
décisions lui-même absent : les choix ci-dessous sont des **hypothèses à valider**.

## Objectif

Remplacer la feuille de sourcing : enregistrer chaque commande fournisseur,
calculer automatiquement le prix de revient unitaire, **mettre le stock Medusa
à jour à la réception**, et voir la **marge** de chaque produit et du mois.

## 1. Données — module `procurement`

**Commande fournisseur (`supplier_order`)** : `reference` (ex. « Alibaba
2026-09-28 »), `supplier` (texte), `ordered_at`, `status` : `draft` (en
préparation / sourcing), `ordered` (commandée et payée), `received`
(réceptionnée), `canceled` ; `exchange_rate` (défaut 670), `fee_rate` (défaut
0,0299), `note`, `received_at`.

**Ligne (`supplier_order_line`)** : `variant_id` (variante Medusa, obligatoire),
libellé figé (produit + variante), `quantity`, `unit_price_usd`,
`freight_usd`, `transport_xof`, `ads_usd`, et, calculés et figés à la
réception : `unit_cost_xof`.

**Coût de revient courant (`variant_cost`)** : `variant_id` (unique),
`unit_cost_xof`, `source_line_id`, `updated_at` — le coût de la **dernière
réception** (hypothèse 2).

## 2. Comportements

- **Calcul en direct** : à chaque saisie, chaque ligne affiche P. T. Achat,
  P. R. total, P. R. unitaire, le prix de vente actuel de la variante (Medusa),
  la marge unitaire et le % ; la commande affiche ses totaux.
- **Commander** (`draft` → `ordered`) : sortie au journal de caisse « Achat de
  marchandises » = Σ (P. T. Achat × taux + transport) des lignes — la pub n'y
  est pas (déjà suivie en publicité au journal ; elle entre seulement dans le
  prix de revient). Idempotent (`reference supplier_order:<id>`).
- **Réceptionner** (`ordered` → `received`) : pour chaque ligne, le stock de
  chaque article d'inventaire de la variante augmente de quantité × quantité
  requise (variantes « kit » comprises) dans l'emplacement de stock unique ;
  le coût unitaire est figé et devient le coût courant de la variante.
- **Annuler** une commande `ordered` : sortie de caisse contrepassée (entrée
  « Annulation achat ») ; une commande `received` ne s'annule pas.

## 3. Écrans (admin)

**Page « Approvisionnement »** :
- Liste des commandes (statut, date, fournisseur, nombre d'articles, coût total).
- Fiche commande : paramètres (taux, frais), lignes (recherche de variante par
  nom, champs du tableur, calculs en direct), boutons **Commander**,
  **Réceptionner**, **Annuler**.

**Page « Marges »** :
- Par variante : coût de revient courant, prix de vente, marge unitaire, %
  (rouge si négative) ; variantes sans coût signalées « coût inconnu ».
- **Marge brute du mois** : pour les commandes payées du mois, Σ quantité ×
  (prix unitaire vendu − coût courant) ; lignes sans coût exclues et comptées.

## 4. Hypothèses (à valider)

1. Une ligne = une variante Medusa existante (créer le produit avant de le
   commander, comme aujourd'hui).
2. Coût courant = coût de la dernière réception (pas de coût moyen pondéré).
3. La commande fournisseur sort de la caisse au moment où elle est commandée.
4. Un seul emplacement de stock.
5. Prix de vente de référence = prix « détail » de la variante dans Medusa
   (le prix « gros » n'existe pas encore dans la boutique).

## 5. Tests

- Unitaires : formules (valeurs de la feuille : détendeur 48 336,87 F / 2 416,84
  F ; kit montre 67 361,65 F), marges, validation des saisies, écritures de
  caisse, quantités de stock par article d'inventaire (kits).
- Local : commande fournisseur → commander (caisse) → réceptionner (stock +1
  vérifié dans Medusa, coût courant) → page Marges.
- Staging puis production.

## Non-objectifs

- Import de l'historique Excel ; prix de gros ; coût moyen pondéré ; plusieurs
  entrepôts ; réception partielle.
