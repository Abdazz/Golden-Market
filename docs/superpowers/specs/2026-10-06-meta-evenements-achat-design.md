# Événements d'achat Meta : site complet, commandes WhatsApp attribuées

Date : 2026-10-06. Décisions prises en autonomie (carte blanche du propriétaire) ; à valider par
lui a posteriori. Suite de la tâche « Meta » de `docs/HANDOFF-PROMPT.md`.

## Constats

- L'API Conversions reçoit chaque commande (`order.placed`, `src/subscribers/order-placed-meta-conversions-api.ts`)
  avec `action_source: "website"` (sauf commandes par téléphone : `phone_call` depuis le 2026-10-06),
  `event_id = order.id` (déduplication avec le pixel de la page de confirmation) et seulement le
  téléphone haché. Or Meta exige pour un événement `website` : `event_source_url` et
  `user_data.client_user_agent` (documentation « Conversions API parameters »). Recommandés :
  `client_ip_address`, `fbp`, `fbc` (non hachés).
- Commandes de l'agent WhatsApp (`place_order`, n8n `EHll8zkvjwPJRJVz`) : `metadata.source =
  "whatsapp"` est posé APRÈS la création de la commande (nœud `Set WhatsApp Metadata`). À
  `order.placed`, la commande n'est pas encore marquée : elle part chez Meta en `website` et le
  client reçoit le modèle de confirmation du site (« Bonjour {prénom} ») au lieu du modèle WhatsApp
  (constaté pour 20261003001).
- Ventes par messagerie chez Meta (`action_source: "business_messaging"`, `messaging_channel:
  "whatsapp"`) : `user_data.whatsapp_business_account_id` et `user_data.ctwa_clid` obligatoires,
  jeton avec la permission `whatsapp_business_manage_events`. Le `ctwa_clid` n'existe que pour un
  client venu d'une publicité « clic vers WhatsApp » (`messages[0].referral.ctwa_clid` du webhook) ;
  il n'est pas conservé aujourd'hui. Aucun jeton actuel n'a la permission (vérifié : jeton CAPI =
  `read_ads_dataset_quality` ; jeton WhatsApp = gestion et messagerie, pas les événements).

## Décisions

### 1. Achats du site : `event_source_url` et données navigateur

- Au moment de passer commande (`placeOrder`, `apps/storefront/src/lib/data/cart.ts`), l'action
  serveur du site lit dans la requête du navigateur : `user-agent`, première adresse de
  `x-forwarded-for` (sinon `x-real-ip`), cookies `_fbp` et `_fbc` (présents seulement si le visiteur
  a accepté le traçage, le pixel les pose). Elle les inscrit dans `cart.metadata.meta_browser`
  (`{ user_agent, client_ip, fbp, fbc }`, champs absents omis) juste avant de valider le panier ;
  Medusa recopie les métadonnées du panier sur la commande. Échec de cette mise à jour : journalisé,
  la commande continue (jamais bloquant).
- L'événement `website` porte `event_source_url = <STOREFRONT_URL>/<pays>/order/<id>/confirmed`
  (page où le pixel envoie le même achat) et, depuis `meta_browser`, `client_user_agent`,
  `client_ip_address`, `fbp`, `fbc`. Sans `user_agent` (ancienne commande, échec), l'événement part
  quand même avec ce qu'il a.
- Consentement : les cookies `_fbp`/`_fbc` n'existent qu'après accord ; l'adresse IP et le
  navigateur sont transmis comme le téléphone haché aujourd'hui (même base que l'existant).

### 2. Commandes WhatsApp : marquage avant création, `ctwa_clid`, source `chat` ou `business_messaging`

- n8n, workflow principal : quand un message entrant porte `referral.ctwa_clid`, il est enregistré
  dans `conversations.ctwa_clid` et `conversations.ctwa_clid_at` (nouvelles colonnes, ajoutées en
  production avant tout déploiement, `../n8n_automation/schema.sql` et base locale de test).
- n8n, `place_order` : avant `Complete Cart`, le panier reçoit `metadata = { source: "whatsapp",
  ctwa_clid }` (`ctwa_clid` seulement s'il date de moins de 7 jours) via l'API Store
  (`POST /store/carts/:id`). Le nœud `Set WhatsApp Metadata` reste (sans effet nuisible). Effet
  immédiat : bon modèle de confirmation WhatsApp et bonne source chez Meta.
- Medusa : règle de source (pure, testée) :
  - `metadata.source === "telephone"` -> `phone_call` ;
  - `metadata.source === "whatsapp"` avec `ctwa_clid` ET configuration WhatsApp présente
    (`META_WHATSAPP_BUSINESS_ACCOUNT_ID` + `META_WHATSAPP_EVENTS_ACCESS_TOKEN`) ->
    `business_messaging`, `messaging_channel: "whatsapp"`, `user_data.whatsapp_business_account_id`,
    `user_data.ctwa_clid`, envoyé avec `META_WHATSAPP_EVENTS_ACCESS_TOKEN` ;
  - autre commande WhatsApp -> `chat` (valeur Meta pour une conversion conclue par messagerie ; pas de
    paramètre web exigé) ;
  - sinon -> `website` (§ 1).
- Si Meta refuse un événement `business_messaging`, il est renvoyé une fois en `chat` avec le même
  `event_id` (aucune vente perdue) et le refus est journalisé.
- Action du propriétaire (rappel dans la passation) : créer dans le Business Manager un jeton
  d'utilisateur système avec `whatsapp_business_manage_events`, relier le jeu de données (pixel) au
  compte WhatsApp Business ; le contrôleur l'ajoute ensuite à l'environnement de production. Tant que
  ce n'est pas fait, les commandes WhatsApp partent en `chat`.

## Hors périmètre

Pas de suppression ultérieure de `meta_browser` des métadonnées de commande (données techniques de
la commande, visibles seulement dans l'admin) ; pas d'événements autres que Purchase.

## Tests

Unitaires : règle de source et construction de l'événement pour les quatre cas ; champs navigateur
présents / absents ; `event_source_url` ; renvoi en `chat` après refus `business_messaging` ;
lecture des en-têtes et cookies côté site (fonction pure). n8n : simulation signée d'un message avec
`referral.ctwa_clid` (colonne remplie) et commande de test `place_order` sur staging (métadonnées du
panier présentes à `order.placed`). Production : prochaine commande réelle du site et de l'agent
contrôlée dans les journaux (« événement Purchase envoyé à Meta », source).
