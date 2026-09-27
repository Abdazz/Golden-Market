# Livreurs et livraisons — design

## Contexte

Golden Market gérait jusqu'ici ses commandes et leurs livraisons dans des
fichiers Excel (`management/Journal de caisse-2026.xlsx` : une feuille par
produit avec date, numéro WhatsApp, statut de livraison, quantité, montant,
**livreur**, commentaire). Le propriétaire veut un mini-SaaS de gestion pour
abandonner ces fichiers. Découpage acté le 2026-09-27 en sous-projets
indépendants, construits **dans l'admin Medusa existant** (source de vérité
unique : commandes, clients, stock, produits) :

1. **Livreurs et livraisons** ← ce document
2. Journal de caisse (entrées/sorties, solde, chiffre d'affaires mensuel)
3. Approvisionnement et marges (commandes fournisseurs, prix de revient)
4. Prospects à relancer

Chaque commande confirmée est confiée à un livreur : soit **livraison express**
chez le client dans un quartier de Ouagadougou, soit **expédition** déposée à
la gare d'une compagnie de transport pour une autre ville. En fin de journée,
le propriétaire doit voir, par livreur, les commandes confiées et leurs statuts,
et **vérifier rapidement que le montant que le livreur lui renvoie est exact**.

## Règles métier (actées avec le propriétaire, 2026-09-27)

- **Seul le propriétaire utilise l'outil.** Le livreur n'a pas de compte : il
  reçoit le détail de chaque commande confiée par **message WhatsApp**
  automatique.
- **Argent** : pour une livraison payable à la réception, le livreur encaisse
  le montant, **prélève lui-même ses frais** en fin de journée et renvoie le
  reste. Pour une expédition, le livreur **n'encaisse rien** (le client paie par
  Orange/Moov Money, **avant ou après** l'envoi) mais **avance ses frais et ceux
  de la compagnie**, déduits de son encaisse de la journée.
- **Frais du livreur** fixés par le livreur, saisis au cas par cas :
  - express (Ouagadougou) : en général 1 000 F ou 1 500 F selon la distance ;
  - expédition : en général 1 000 F pour le livreur + 1 000 F ou 1 500 F de
    frais de compagnie (soit 2 000 F ou 2 500 F au total).
- **Échec** (client absent, injoignable, refus) : la livraison est à relivrer
  (nouvelle tentative), des frais peuvent ou non être dus au livreur pour le
  déplacement (au cas par cas).
- **Report automatique** : une livraison confiée un jour et **pas faite ce jour-
  là** est reportée automatiquement au lendemain chez le même livreur — ni
  échec ni nouvelle tentative, pas de frais pour le report.

## 1. Données

Module Medusa custom `delivery` (même approche que les modules existants,
`src/modules/*`), lié aux commandes par un lien de module (order ↔ delivery).

**Livreur (`courier`)** : `name`, `phone` (normalisé +226, voir
`lib/normalize-phone.ts`), `active` (un livreur inactif n'est plus proposé mais
garde son historique), `notes`.

**Livraison (`delivery`)** — **une par tentative** :
- `order_id` (lien), `courier_id` ;
- `tour_date` : jour de tournée (date à laquelle elle doit être faite ;
  avancé par le report automatique) ; `assigned_at` ; `completed_at` ;
  `postponed_count` (nombre de reports automatiques) ;
- `type` : `express` | `expedition` ;
- express : `address` (quartier/adresse, pré-rempli depuis l'adresse de
  livraison de la commande, modifiable) ;
- expédition : `transport_company` (liste de compagnies habituelles + saisie
  libre), `destination_city`, `parcel_reference` (facultative) ;
- `status` :
  - express : `assigned` (Confiée) → `delivered` (Livrée) | `failed` (Échec,
    `failure_reason`, `redeliver` booléen) ;
  - expédition : `assigned` → `shipped` (Déposée à la gare) ;
  - `canceled` si la commande est annulée ;
- `amount_to_collect` : figé à l'attribution — reste dû de la commande si elle
  est payable à la réception, 0 si déjà payée ou si expédition ;
- `amount_collected` : pré-rempli avec `amount_to_collect` au passage à
  `delivered`, corrigeable ;
- `courier_fee` ; `transport_fee` (expédition) ;
- `whatsapp_status` (`sent` | `failed` | `pending`) et `whatsapp_error`.

**Versement (`courier_settlement`)** — un par livreur et par jour :
`courier_id`, `day`, `expected_amount` (figé à la validation), `received_amount`,
`validated_at`, `note`. Une journée validée **verrouille** ses livraisons
(modification possible seulement après « Rouvrir la journée »).

**Montant à reverser d'une journée** (calculé) = Σ `amount_collected` −
Σ `courier_fee` − Σ `transport_fee` des livraisons **terminées ce jour-là**
(`completed_at`), du livreur. Peut être négatif (le propriétaire doit alors de
l'argent au livreur, ex. journée d'expéditions uniquement). Une livraison
reportée n'est jamais comptée avant d'avoir été faite.

**Report automatique** : job planifié Medusa chaque nuit (00 h 05, heure de
Ouagadougou = UTC) : toute livraison `assigned` avec `tour_date` < aujourd'hui
passe à `tour_date` = aujourd'hui, `postponed_count` + 1. Affichée dans la
tournée avec « Reportée (depuis le JJ/MM) ».

**Effets sur la commande Medusa** (workflows natifs) :
- `delivered` avec encaissement → collecte de paiement marquée payée ;
- `delivered` / `shipped` → avancement de la colonne native « Fulfillment »
  (création du fulfillment puis livré / expédié) ;
- expédition payée après l'envoi : la commande reste non payée et figure dans
  « Expéditions à faire payer » jusqu'au « Mark as paid » (Orange/Moov Money).

## 2. Écrans (admin Medusa, utilisables sur téléphone)

**Fiche commande** : encadré « Livraison » (colonne latérale, sous le
« N° de commande ») : bouton **« Confier à un livreur »** (type présélectionné
selon la ville : Ouagadougou → express, sinon expédition ; livreur ; compagnie et
destination si expédition), statut en cours, historique des tentatives.

**Page « Livraisons »** (menu latéral), onglets :
- **À confier** : commandes non livrées sans livraison en cours (y compris
  échecs « à relivrer ») ; sélection multiple → un livreur.
- **Tournée du jour** : sélection livreur + date (aujourd'hui par défaut). Une
  ligne par livraison : N° de commande (20260927001), client, quartier ou
  destination, **articles × quantités**, type, statut (avec « Reportée » le cas
  échéant), à encaisser, encaissé, frais livreur, frais compagnie. Actions sur
  la ligne : *Livrée* / *Échec* (motif, « à relivrer ») / *Déposée à la gare* ;
  frais avec raccourcis 1 000 / 1 500. Pied : totaux, **« À reverser : X F »**,
  champ « Montant reçu », bouton « Valider le versement », écart en rouge.
- **Expéditions à faire payer** : expéditions déposées dont la commande n'est
  pas payée, avec le numéro du client.
- **Livreurs** : ajout, modification, désactivation.

**Message WhatsApp au livreur** : via le webhook n8n existant
`order-confirmation` (générique : `template_name` + `params`) — aucun nouveau
workflow n8n. Nouveau modèle Meta **`nouvelle_livraison`** (UTILITY) à faire
approuver. Contenu : N° de commande, client (nom + téléphone), adresse ou
compagnie/destination, articles × quantités, montant à encaisser (« Rien à
encaisser » pour une expédition). Un livreur qui n'a pas écrit au numéro dans
les 24 h ne peut recevoir qu'un modèle approuvé.

## 3. Erreurs et cas limites

- Message au livreur non envoyé → livraison enregistrée quand même,
  avertissement + bouton **« Renvoyer le message »**.
- **Une seule livraison en cours** par commande.
- Commande annulée → ne peut plus être confiée ; déjà confiée → ligne marquée
  `canceled`, rien à encaisser.
- Journée validée → verrouillée ; « Rouvrir la journée » pour corriger.
- Montant encaissé ≠ attendu → accepté, écart signalé (ligne et total).
- Échec de synchronisation avec la commande Medusa (paiement / fulfillment) →
  livraison enregistrée, avertissement ; le statut de livraison fait foi.

## 4. Tests

- Unitaires (TDD) : montant à reverser (négatif, échecs, expéditions,
  livraisons reportées exclues), `amount_to_collect` figé, règles de statut
  (une tentative en cours, journée verrouillée), report automatique, message au
  livreur.
- Local (admin local, connexion avec le compte de test) : journée fictive avec
  deux livreurs, express + expéditions, livrée / échec / déposée / reportée,
  frais, versement.
- Staging : vrai message WhatsApp au livreur (numéro du propriétaire comme
  livreur de test).

## 5. Déploiement

1. Soumission du modèle `nouvelle_livraison` à Meta dès le début.
2. Module + migrations, job de report, routes et écrans : local → staging →
   production.
3. Documentation (`AGENTS.md`, `HANDOFF.md`) ; création des livreurs réels
   (noms relevés dans les Excel : Abdourazack, Zakaria…) avec leurs numéros.

## Non-objectifs

- Accès des livreurs à l'outil (compte, page mobile) — le message WhatsApp suffit.
- Tarification automatique par zone/quartier.
- Suivi GPS, preuve de livraison (photo/signature).
- Journal de caisse, marges, prospects : sous-projets suivants.
