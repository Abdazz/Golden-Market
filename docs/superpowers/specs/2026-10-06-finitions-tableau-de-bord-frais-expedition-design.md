# Finitions du tableau de bord, des frais d'expédition et des commandes par téléphone

Date : 2026-10-06. Défauts mineurs relevés par les revues des 2026-10-04 et 2026-10-05 (specs
`2026-10-04-tableau-de-bord-design.md` et `2026-10-04-frais-expedition-par-produit-design.md`),
plus le total du formulaire « Nouvelle commande » signalé le 2026-10-06. Décisions prises en
autonomie (propriétaire absent, carte blanche) : à valider par lui a posteriori.

## Changements

### 1. Tableau de bord : chiffres indisponibles avec leur libellé

Dans les cartes « Aujourd'hui » et « Ce mois », un chiffre indisponible affiche son libellé
(« Commandé » / « Encaissé ») suivi de « Indisponible » en gris, au lieu d'un « Indisponible pour le
moment. » anonyme. Même rendu pour les cartes Caisse et Marge (libellé de chaque montant).

### 2. Tableau de bord : cartes à 3 montants sur téléphone

Cartes « Caisse » et « Marge brute du mois » : grille `grid-cols-1` sur téléphone, `sm:grid-cols-3`
à partir de 640 px (aujourd'hui 3 colonnes serrées à 390 px, montants coupés).

### 3. Livraisons de commandes annulées

Aujourd'hui, une livraison « confiée » dont la commande est annulée reste `assigned` (donc comptée
« en cours » au tableau de bord) jusqu'à l'ouverture de l'onglet Tournée, qui la passe à `canceled`.
Désormais un abonné `order.canceled` (`src/subscribers/order-canceled-deliveries.ts`) passe aussitôt
à `canceled` les livraisons `assigned` de la commande, avec `updateDeliveryWorkflow` (même écriture
que la route Tournée). La règle de sélection est pure et testée (`deliveriesToCancel(deliveries)`
dans `src/lib/delivery-rules.ts` : livraisons au statut `assigned`). La correction faite à
l'ouverture de la Tournée reste en place (filet de sécurité). Échec de l'abonné : journalisé, sans
effet sur l'annulation de la commande.

### 4. Encadré « Frais d'expédition » et widget vidéo : coupure réseau

Une erreur réseau pendant l'enregistrement (fetch qui échoue) affiche « Service injoignable,
réessayez. » et réactive le bouton, au lieu de rester sur « Enregistrement… ». Même traitement pour
le widget vidéo produit.

### 5. Widget vidéo : « Retirer » supprime vraiment la vidéo

Medusa fusionne les métadonnées : supprimer la clé côté client ne la retire pas. « Retirer » envoie
`video_url: ""`, que Medusa supprime (comportement constaté pour `frais_expedition_xof`). Le widget
traite une chaîne vide comme « pas de vidéo ».

### 6. Test unitaire de la route des commandes par téléphone

`src/api/admin/phone-orders/__tests__/route.unit.spec.ts` : requête invalide -> 400 avec le message
de `parsePhoneOrderInput` ; frais d'expédition calculés pour la ville et transmis au brouillon
(Kaya : frais du produit ; Ouagadougou : 0) ; client existant réutilisé, client inconnu créé ;
configuration incomplète -> 500. Workflows Medusa simulés (`jest.mock("@medusajs/medusa/core-flows")`).

### 7. Frais par défaut : 1 000 F au lieu de 1 500 F

Le propriétaire a fixé 1 000 F pour 38 produits sur 39 (balai-éponge à 1 500 F, saisi explicitement).
Le défaut, qui ne s'applique plus qu'aux nouveaux produits sans frais saisis, passe à 1 000 F :
`DEFAULT_SHIPPING_FEE_XOF` (`src/lib/shipping-fee-rules.ts`), `DEFAULT_FEE` de l'encadré produit,
textes et documentation (`AGENTS.md`, spec, guide n8n et consigne de l'agent si elle cite 1 500 F).
Aucun produit existant ne change (tous ont des frais saisis).

### 8. Formulaire « Nouvelle commande » : frais d'expédition dans le total

- Nouvelle route `GET /admin/phone-orders/shipping-fee?city=<ville>&variant_ids=<id1,id2>` ->
  `{ amount }`, calculée par `shippingFeeForVariants` (même calcul que la création de la commande).
- Le formulaire affiche, sous les articles : « Livraison : Gratuite (Ouagadougou) » ou
  « Livraison : 1 000 F », puis « Total : <articles + livraison> ». Recalcul à chaque changement de
  ville ou d'articles (attente de 300 ms) ; pendant le calcul « Livraison : calcul… » ; en cas d'échec
  « Livraison : calculée à la validation » et le total affiché reste celui des articles.

### 9. Suivi Meta des commandes par téléphone

L'événement Purchase envoyé à l'API Conversions de Meta porte aujourd'hui `action_source: "website"`
pour toutes les commandes. Une commande saisie dans l'admin (`order.metadata.source = "telephone"`)
est envoyée avec `action_source: "phone_call"` (valeur prévue par Meta pour une vente conclue par
téléphone ; aucun pixel navigateur, donc pas de déduplication à gérer). Les commandes du site et de
l'agent WhatsApp gardent `website` (la valeur Meta `business_messaging` exige une configuration
WhatsApp côté Meta non vérifiée : hors périmètre). Règle pure `actionSourceFor(metadata)` dans
`src/lib/meta-conversions-mapping.ts`, testée ; l'abonné demande `metadata` dans `query.graph`.

## Tests

Unitaires (TDD) : `deliveriesToCancel`, route des commandes par téléphone, route `shipping-fee`
(paramètres manquants -> 0 / 400 selon le cas : `variant_ids` vide -> `{ amount: 0 }`, `city`
absente -> calcul hors Ouagadougou comme `shippingFeeForVariants`), `DEFAULT_SHIPPING_FEE_XOF = 1000`
(tests existants des frais mis à jour). Local : tableau de bord bureau et téléphone, formulaire
« Nouvelle commande » (Kaya / Ouagadougou), encadré frais et widget vidéo réseau coupé, annulation
d'une commande confiée. Staging puis production.
