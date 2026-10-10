# Livreurs reconnus par l'agent WhatsApp et copie du message livreur

Date : 2026-10-10. Demandes du propriétaire (deux messages du même jour), décisions prises en
autonomie (consigne du 2026-10-05), à relire par le propriétaire.

## Objectif

1. L'agent IA WhatsApp (n8n, workflow principal `i6KGA9BvK9unjxxj`) sait quels numéros sont ceux
   des livreurs Golden Market (table `courier` de Medusa) et adapte sa conversation : un livreur
   n'est pas un client. Quand un livreur envoie un reçu d'expédition (ticket de la compagnie de
   transport), l'agent le transmet à l'équipe sans vérifier ni discuter les montants.
2. Sur la fiche commande de l'admin Medusa, un bouton copie le message au livreur exactement
   dans le format des messages automatiques (modèles Meta `livraison_livreur_ouaga` et
   `livraison_livreur_expedition`), pour un envoi manuel depuis un téléphone si besoin.

## Lot A - Livreurs reconnus par l'agent

### Source des numéros

La liste des livreurs vit dans Medusa (`courier.name`, `courier.phone`, `courier.active`), route
existante `GET /admin/couriers` (auth Basic avec la clé admin déjà utilisée par n8n). Aucune
copie dans la base chat, aucune nouvelle colonne (pas de migration à poser en production avant
déploiement).

### Workflow principal n8n

- Nouveau nœud Code **`Identify Courier`** inséré entre `Edit Fields` et `Is Image Message` :
  appelle `GET {MEDUSA_BACKEND_URL[_PRODUCTION]}/admin/couriers` (`this.helpers.httpRequest`,
  en-tête Basic construit comme dans `Resolve Medusa Admin Auth`), garde les livreurs
  `active = true`, compare les **8 derniers chiffres** du numéro (`from`, ex. `22670000000`) à
  ceux de `courier.phone` (`+226 70 00 00 00`, `70000000`...). Sortie : l'item de `Edit Fields`
  enrichi de `courier` (`{ id, name }` ou `null`) et `courier_name` (`''` si client). Toute erreur
  (Medusa injoignable, clé refusée, délai 5 s) = `courier: null`, journalisée, jamais bloquante :
  le correspondant est alors traité comme un client.
- **`Final Message`** ajoute `courier_name` (lu dans `Identify Courier`) pour la suite du flux.
- **`Describe Image (Vision)`** : consigne différente pour un livreur. Si l'image est un ticket,
  reçu ou bordereau d'une compagnie de transport (colis déposé en gare), la description commence
  par « Reçu d'expédition : » et recopie compagnie, villes de départ et d'arrivée, destinataire et
  téléphone, numéro de colis ou référence, montant, date. Un reçu de paiement reste « Reçu de
  paiement : … ». Pour un client, la consigne actuelle ne change pas.
- **`AI Agent`** : quand `courier` est présent, le texte envoyé à l'IA commence par une note
  interne : « Ce correspondant n'est PAS un client : c'est NOM, livreur de Golden Market (numéro
  connu de l'équipe). Applique la section Livreurs. » Le prompt système gagne une section
  **Livreurs de Golden Market** :
  - ne jamais traiter un livreur comme un client : pas de présentation de produits à vendre, pas
    de `place_order`, pas de `get_payment_instructions`, jamais `mark_payment_reported` ;
  - ton simple, chaleureux et très bref (c'est un collègue) ;
  - reçu d'expédition (« Reçu d'expédition : … », ou le livreur dit avoir déposé un colis) :
    appeler `report_courier_receipt` avec un résumé fidèle (compagnie, destination, destinataire,
    référence, montant tels que lus), puis répondre seulement « Bien reçu, merci 🙏 » ; **ne
    jamais vérifier, comparer ni commenter un montant, ne poser aucune question sur les frais** :
    l'équipe s'en charge ;
  - reçu de paiement envoyé par un livreur (versement à l'équipe) : même traitement que le reçu
    d'expédition (`report_courier_receipt`, pas `mark_payment_reported`) ;
  - question ou problème (client absent, adresse, téléphone d'un client, produit manquant) :
    dire que l'équipe est prévenue et appeler `escalate_to_human` ; l'agent n'a pas accès aux
    commandes pour les livreurs.
- Nouveau tool **`report_courier_receipt`** (sous-workflow `Tool - report_courier_receipt`,
  id `CourierReceipt7Qx`) : entrées `summary` (`$fromAI`), `conversation_id`
  (`$('SQL_query_1').item.json.id`) et `courier_name` (`$('Identify Courier').first().json
  .courier_name`, jamais fourni par le modèle). Lit `phone_number` dans `conversations`, envoie
  au propriétaire le modèle `escalation_alert` (numéro ; « Reçu d'expédition de NOM (livreur) :
  résumé », 300 caractères max, sans retour à la ligne, jamais vide ; lien
  `https://golden-market.co/app/whatsapp-conversations?phone=…`) ; sans accusé `wamid` de Meta, un
  courriel de secours (Resend, comme `escalate_to_human`) ; renvoie toujours « Transmis à l'équipe. »
  (échec d'alerte journalisé). **Ne change pas le
  statut de la conversation** : l'IA continue de répondre au livreur.
- Décision : « Déposée à la gare », la référence du colis et les frais de compagnie restent
  saisis à la main dans l'admin (tournée du jour). Pas d'écriture automatique dans Medusa à
  partir d'une lecture IA d'un reçu.
- Mode `human` / `resume` inchangés : si le propriétaire prend la main sur la conversation d'un
  livreur, l'IA se tait comme pour un client.

### Admin Medusa (visualiseur de conversations)

- `admin/lib/courier-match.ts` : `courierFor(couriers, phone)` (8 derniers chiffres, livreurs
  actifs seulement) et `courierBadge(c)` = « Livreur · NOM ». Testé.
- Composant `whatsapp-courier.tsx` : badge « Livreur · NOM » (lien vers
  `/app/deliveries?tab=couriers`) dans l'en-tête d'une conversation, à côté du badge prospect.
  Liste des conversations : le nom du livreur remplace le numéro quand la conversation n'a pas de
  nom client, avec la mention « Livreur ». Liste des livreurs chargée une fois par page.

### Documentation n8n

`guide-golden-market-agent.md` : nouvelle section « 2.12 Livreurs reconnus par l'agent »
(nœud, tool, consignes, test), tool compté dans la liste (9 tools), `AGENTS.md` du dépôt n8n mis à
jour. Sauvegardes des versions précédentes dans `~/n8n-backups/2026-10-10/` sur le VPS.

## Lot B - Copier le message livreur depuis la fiche commande

- Module pur **`src/lib/courier-message-text.ts`** (sans dépendance Node, importable par l'admin) :
  `buildCourierMessage` (déplacé depuis `delivery-message.ts`, qui le réexporte),
  `COURIER_TEMPLATE_BODIES` (corps exacts des deux modèles approuvés par Meta, variables
  `{{n}}`), `renderCourierMessage({ template_name, params })` (substitution des variables) et
  `courierMessageText(input)` = rendu de `buildCourierMessage(input)`. Testé : le texte rendu pour
  l'exemple Meta (« Marina », « 22670305367 »…) est identique au corps du modèle rempli.

  Corps Meta (vérifiés sur le compte le 2026-10-10) :

  ```
  🛵 NOUVELLE COMMANDE — Golden Market
  👤 Client : {{1}}
  📞 Téléphone : {{2}}
  📍 Destination : {{3}}
  📦 Produit : {{4}}
  🔢 Quantité : {{5}}
  💰 Montant à encaisser : {{6}} F CFA
  ```

  ```
  🛵 NOUVELLE COMMANDE — Golden Market
  👤 Client : {{1}}
  📞 Téléphone : {{2}}
  📍 Expédition : {{3}}
  🚚 Compagnie de transport : {{4}}
  📦 Produit : {{5}}
  🔢 Quantité : {{6}}

  Merci 🙏
  ```

- Route `GET /admin/deliveries/by-order/:order_id` : `order` gagne `customer_name`,
  `customer_phone` et `items` ; chaque ligne (`toTourLine`) gagne `address`, `transport_company`
  et `destination_city` (bruts, nullables), en plus de `place`.
- Encadré « Livraison » de la fiche commande (`widgets/order-delivery.tsx`) :
  - **avant attribution** : bouton « Copier le message livreur » sous le formulaire, texte
    construit à partir des champs saisis (type, quartier ou compagnie et ville, montant à
    encaisser) et de la commande ;
  - **livraison en cours** (pas pour l'historique des tentatives terminées) : bouton identique à
    partir des données de la livraison, même texte que le message automatique envoyé ;
  - clic : `navigator.clipboard.writeText`, confirmation « Message copié » 3 s ; si le presse-papiers
    est refusé, le texte s'affiche dans une zone sélectionnable avec « Copiez le texte ci-dessous » ;
  - lien « Voir le message » qui déplie un aperçu `<pre>` (retours à la ligne conservés).
- Aucune route ni table nouvelle. Le texte copié est le rendu local des mêmes paramètres que le
  message automatique (même fonction), donc identique à ce que Meta affiche.

## Hors périmètre

- Automatiser « Déposée à la gare » depuis un reçu lu par l'IA.
- Envoi manuel depuis l'admin au livreur hors modèle (fenêtre 24 h) : le bouton copie seulement.
- Livreurs inactifs : traités comme des clients par l'agent et sans badge.

## Tests

- Unitaires : `courier-message-text` (rendu exact, variables manquantes = chaîne vide, `\n`
  conservés), `courier-match` (8 derniers chiffres, inactif ignoré), `delivery-message` inchangés.
- n8n : webhook signé depuis un numéro de test enregistré comme livreur (`Test Claude`, numéro
  fictif `22600000099`, créé puis désactivé en production), texte « Colis déposé à Rahimo pour
  Bobo, réf 4521 » → exécution : `Identify Courier.courier` renseigné, tool
  `report_courier_receipt` appelé, alerte reçue par le propriétaire, réponse brève ; même numéro
  avec une image de reçu fictive téléversée (`POST /{phone_id}/media`) → description « Reçu
  d'expédition : … ». Un client ordinaire (numéro inconnu) → `courier: null`, flux inchangé.
- Admin : vérification visuelle en local (fiche commande : copie avant et après attribution ;
  conversations : badge livreur).

## Lot C - Variante du produit dans la confirmation de commande au client

Demande du propriétaire le 2026-10-10 : la confirmation WhatsApp au client (`order_confirmation_from_*`)
affichait « Balai-éponge à essorage automatique » sans « Avec seau » / « Sans seau ». Le libellé d'un
article devient « Titre du produit - Titre de la variante » quand la variante est nommée (jamais pour
« Default Title », « Default variant » ou une variante au même nom que le produit), règle unique dans
`src/lib/order-item-label.ts`, partagée par la confirmation client et le message au livreur
(`itemsOf`). Plusieurs articles : « N articles » inchangé.
