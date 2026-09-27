# Reprise manuelle des conversations WhatsApp depuis l'admin Medusa

## Contexte

L'agent WhatsApp (workflow n8n `Golden Market Sales Automation Workflow`,
id `i6KGA9BvK9unjxxj`, dépôt `n8n_automation`) répond seul aux clients sur le
numéro Cloud API `+226 61 85 37 37`. L'admin Medusa dispose d'un visualiseur
de conversations **en lecture seule** (`/app/whatsapp-conversations`, spec
`2026-09-07-whatsapp-conversations-viewer-design.md`), qui lit directement la
base `golden_market` (tables `public.conversations` / `public.messages`) via
le rôle Postgres `medusa_whatsapp_reader`.

Deux manques constatés le 2026-09-27 :

1. **Le propriétaire n'a aucun moyen de répondre lui-même à un client.** Le
   numéro est inscrit uniquement sur l'API Cloud (pas d'appli WhatsApp
   Business). La coexistence appli + API a été étudiée et écartée le
   2026-09-27 (numéro à réinscrire via l'appli, statut Tech Provider exigé,
   portefeuille Business Meta non vérifié).
2. **Une escalade n'arrête pas l'IA.** Le statut `escalated` est posé par
   `escalate_to_human` et par le garde-fou `find_products`, mais le workflow
   principal ne le lit jamais avant d'appeler l'AI Agent : l'IA continue de
   répondre au message suivant.

## Objectif

Permettre au propriétaire, depuis l'admin Medusa (ordinateur et téléphone) :

1. de **prendre la main** sur n'importe quelle conversation (l'IA se tait) et
   de la **rendre** à l'IA ;
2. de **répondre lui-même** au client (texte) ;
3. de **relancer** un client dont la fenêtre WhatsApp de 24 h est expirée, via
   un template approuvé ;
4. d'être **alerté sur WhatsApp** quand un client écrit pendant qu'il a la
   main, sans être submergé.

Et garantir qu'**aucun client n'est laissé sans réponse indéfiniment** : si le
client réécrit plus de 2 h après la dernière action humaine, l'IA reprend.

## Décisions actées avec le propriétaire (2026-09-27)

| Sujet | Décision |
|---|---|
| Architecture | Approche A : Medusa = interface + lecture ; n8n = seul écrivain de la base `golden_market` et seul détenteur du jeton WhatsApp |
| Retour à l'IA | Bouton manuel **+ filet de sécurité** : reprise automatique si le client réécrit plus de **2 h** après la dernière action humaine |
| Alertes | Au plus **une alerte WhatsApp toutes les 30 min par conversation** quand le client écrit pendant que l'humain a la main |
| Hors fenêtre 24 h | Bouton d'envoi d'un **template de relance** `reprise_conversation` |
| Appareils | Ordinateur et téléphone à égalité (2 colonnes sur grand écran, 1 à la fois sur mobile) |

## Non-objectifs

- Envoi de médias (photos, documents) par le propriétaire — texte seulement.
  (L'IA sait déjà envoyer les photos produit via `send_product_images`.)
- Affichage des médias bruts envoyés par le client : l'admin montre la
  description (photo) / transcription (vocal) déjà stockée, comme aujourd'hui.
- Plusieurs opérateurs, attribution de conversations, notes internes.
- Temps réel par websocket : un rafraîchissement périodique suffit.
- Staging/local : comme le visualiseur, la fonctionnalité n'existe qu'en
  production (un seul n8n réel, base `golden_market` absente ailleurs).

## 1. Modèle de données (base `golden_market`, propriété de `n8n_automation`)

**Qui a la main** — réutilisation du statut existant, pas de second indicateur :

- `active` : l'IA répond (inchangé) ;
- `escalated` : **un humain a la main, l'IA se tait**. Posé par l'escalade
  (IA ou garde-fou), par « Prendre la main » et par tout envoi manuel ;
- `closed` : inchangé (inutilisé à ce jour).

**Nouvelles colonnes `conversations`** :

```sql
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS human_last_action_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS owner_alerted_at TIMESTAMPTZ;
```

- `human_last_action_at` : dernière action humaine (prise de main, envoi
  manuel, **ou escalade** — voir § 2b). Base du délai de 2 h.
- `owner_alerted_at` : dernière alerte WhatsApp envoyée au propriétaire pour
  cette conversation. Base du délai de 30 min.

**Nouveau rôle `human` dans `messages`** (réponse écrite par le propriétaire,
y compris le texte réel du template de relance) :

```sql
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_role_check
  CHECK (role IN ('user', 'assistant', 'system', 'human'));
```

Le `wamid` renvoyé par Meta est stocké dans `whatsapp_msg_id`.

**Fenêtre de 24 h** : calculée, jamais stockée —
`max(created_at) WHERE role = 'user'` + 24 h.

Migration idempotente ajoutée à `schema.sql` (`n8n_automation`) et appliquée
à la main en production. Le nom exact de la contrainte `CHECK` existante est
vérifié avant application (`\d messages`). Le rôle `medusa_whatsapp_reader`
doit voir les nouvelles colonnes (droit `SELECT` au niveau table, à vérifier).

## 2. n8n

### 2a. Nouveau workflow « Admin - actions conversation »

`POST /webhook/admin-conversation-action`, appelé uniquement par Medusa.
En-tête `x-admin-actions-secret` comparé à `N8N_ADMIN_ACTIONS_WEBHOOK_SECRET`
(nouvelle variable du `.env` n8n, déclarée dans le bloc `environment:` du
service) — sinon `401`. Même schéma que le workflow de confirmation de
commande (`N8N_ORDER_CONFIRMATION_WEBHOOK_SECRET`).

Corps : `{ "action": "...", "phone_number": "+226...", "text"?: "..." }`.

| Action | Traitement |
|---|---|
| `take_over` | `status = 'escalated'`, `human_last_action_at = now()` |
| `hand_back` | `status = 'active'`, `consecutive_search_misses = 0` (évite une réescalade immédiate par le garde-fou) |
| `send_text` | Si dernier message `user` > 24 h (ou aucun) → `window_expired`, rien n'est envoyé. Sinon envoi Cloud API `type: text`, puis insertion `messages` (`role = 'human'`, `whatsapp_msg_id` = wamid), `status = 'escalated'`, `human_last_action_at = now()`, `last_message_at = now()` |
| `send_reengagement` | Envoi du template `reprise_conversation`, puis mêmes écritures que `send_text` avec le texte réel du template comme `content` |

Réponse toujours en JSON (node *Respond to Webhook*) :

```json
{ "ok": true, "message": { "role": "human", "content": "...", "createdAt": "..." }, "warning": null }
{ "ok": false, "error_code": "window_expired | whatsapp_error | not_found | invalid_request", "message": "..." }
```

- `whatsapp_error` porte le message d'erreur Meta (ex. numéro injoignable).
- Écriture en base échouée après un envoi Meta réussi → `ok: true` +
  `warning: "not_saved"` ; le workflow d'erreur existant (`Alerte erreur n8n
  (email)`) est déclenché.
- Conversation inconnue → `not_found`.

### 2b. Workflow principal — message client entrant

Inchangé jusqu'à `SQL_query_1` (vérification de signature, traitement des
médias, recherche/création de la conversation). Ensuite, nouveau nœud de
décision :

- **`status = 'escalated'` et `now() - human_last_action_at < 2 h`**
  (mode humain) :
  1. enregistrer le message client seul (`role = 'user'`, idempotence par
     `whatsapp_msg_id` conservée), `last_message_at = now()` ;
  2. si `owner_alerted_at` est nul ou date de plus de 30 min : alerte au
     propriétaire (template existant `escalation_alert`, raison = extrait du
     message client), puis `owner_alerted_at = now()`. Si le template accepte
     un paramètre libre, y ajouter le lien direct
     `/app/whatsapp-conversations?phone=<numéro>` ; sinon le numéro suffit ;
  3. **ne pas appeler l'AI Agent**, ne rien envoyer au client.
- **`status = 'escalated'` et délai ≥ 2 h (ou `human_last_action_at` nul)**
  (filet de sécurité) : `status = 'active'`, `consecutive_search_misses = 0`,
  puis passage normal à l'AI Agent avec, en tête de l'entrée, la note :
  « Note interne : un membre de l'équipe avait pris la main mais n'a pas
  répondu depuis plus de 2 h. Reprends la conversation avec tact, sans
  contredire ce que l'équipe a dit. »
- **Sinon** : comportement actuel inchangé.

**Escalades** : `Mark Escalated` (garde-fou de `find_products`) et
`escalate_to_human` renseignent aussi `human_last_action_at = now()`, pour que
le délai de 2 h parte de l'escalade si le propriétaire n'agit pas.

**Historique transmis à l'IA** (`SQL_query_2`) : les lignes `human` sont
présentées comme messages de l'assistant préfixés par
« [Message de l'équipe Golden Market] », pour que l'IA sache ce qui a été
dit ou promis.

**Robustesse** (`onError: "continueErrorOutput"` au niveau racine des nœuds,
voir piège du guide § 2.6) : si la lecture du mode échoue, le flux retombe sur
l'IA (un client reçoit toujours une réponse) ; l'échec de l'alerte au
propriétaire ne bloque jamais l'enregistrement du message client.

## 3. Admin Medusa (`apps/backend`)

### 3a. Serveur

- **`src/lib/whatsapp-admin-actions-client.ts`** — appelle le webhook n8n
  (`N8N_ADMIN_ACTIONS_WEBHOOK_URL`, `N8N_ADMIN_ACTIONS_WEBHOOK_SECRET`,
  production uniquement, déclarées dans `docker-compose.prod.yml` et
  documentées dans `.env.template`), délai max 20 s, `fetch` injectable pour
  les tests. Résultat typé :
  `ok | window_expired | whatsapp_error | not_found | invalid_request | unavailable`
  (`unavailable` = variables absentes, n8n injoignable, délai dépassé ou
  réponse non-JSON).
- **Routes admin** (authentification admin Medusa, comme l'existant) :
  - `POST /admin/whatsapp-conversations/:phone/take-over`
  - `POST /admin/whatsapp-conversations/:phone/hand-back`
  - `POST /admin/whatsapp-conversations/:phone/messages` — corps `{ text }`
    validé (zod) : non vide après `trim`, ≤ 4 096 caractères
  - `POST /admin/whatsapp-conversations/:phone/reengagement`

  Correspondance HTTP : `ok` → 200, `invalid_request` → 400, `not_found` →
  404, `window_expired` → 409, `whatsapp_error` → 502, `unavailable` → 503.
- **Lecture enrichie** (`src/lib/whatsapp-chat-db.ts`) :
  - `getConversationMessages` devient `getConversation` : renvoie
    `{ phoneNumber, customerName, status, humanLastActionAt,
    lastUserMessageAt, messages }` (rôle `human` inclus) ;
  - `listConversations` ajoute `awaitingReply` (dernier message = `user` et
    `status = 'escalated'`) et `status`.
- **Fonction pure** `computeReplyWindow(lastUserMessageAt, now)` →
  `{ open: boolean, expiresAt: Date | null }`, partagée par la route et la
  page (le serveur reste l'autorité : n8n revérifie avant d'envoyer).

### 3b. Page `/app/whatsapp-conversations` (refaite)

- **Mise en page** : 2 colonnes ≥ 1024 px (liste | conversation) ; en dessous,
  un seul panneau à la fois avec bouton retour.
- **Liste** : recherche par numéro (inchangée), tri par dernière activité,
  badge « Vous avez la main » (`escalated`), point « en attente de votre
  réponse » (`awaitingReply`).
- **Conversation** :
  - fil type messagerie — client à gauche ; IA à droite (neutre) ; « Vous »
    à droite (couleur distincte) ; horodatage par message ;
  - en-tête : numéro, nom, statut, bouton « Prendre la main » / « Rendre la
    main à l'IA », temps restant de la fenêtre (« encore 5 h 12 pour
    répondre librement ») ;
  - zone de saisie en bas (Entrée = retour à la ligne, bouton Envoyer
    désactivé pendant l'envoi) ; **hors fenêtre** : remplacée par
    l'explication et le bouton « Envoyer le message de relance » ;
  - erreurs affichées en ligne (toast), jamais d'échec silencieux.
- **Rafraîchissement** : conversation ouverte toutes les 10 s, liste toutes
  les 30 s, uniquement si l'onglet est visible (`document.visibilityState`).
- **Lien direct** : `?phone=<numéro>` ouvre la conversation.

## 4. Template Meta `reprise_conversation`

- Langue `fr`, catégorie `UTILITY` (Meta peut la reclasser `MARKETING`), sans
  variable.
- Corps : « Bonjour, ici l'équipe Golden Market. Nous revenons vers vous suite
  à votre message. Répondez à ce message pour poursuivre la conversation. »
- Soumis par API au début de l'implémentation (approbation : quelques heures).
  Tant qu'il n'est pas approuvé, `send_reengagement` renvoie
  `whatsapp_error` avec le message Meta.

## 5. Tests

- **Medusa (TDD, Jest unitaire)** : client du webhook (correspondance des
  réponses, 401/500/délai/non-JSON → `unavailable`, variables absentes),
  validation des routes et correspondance HTTP, requêtes enrichies de
  `whatsapp-chat-db` (exécuteur simulé, comme les tests existants),
  `computeReplyWindow`.
- **Page admin** : pas de suite de tests d'interface — vérification manuelle
  dans le navigateur sur l'admin de production (ordinateur + largeur mobile).
- **n8n** (webhooks signés, numéro fictif, conversation supprimée ensuite) :
  prise de main → message client → aucune réponse IA ; plafonnement des
  alertes à 30 min ; `send_text` ; fenêtre expirée (messages antidatés) ;
  reprise par l'IA après 2 h (`human_last_action_at` antidaté) ;
  `hand_back` ; secret invalide → 401. Les alertes des tests arrivent
  réellement sur le WhatsApp du propriétaire (2-3 messages).
- **Test final** par le propriétaire depuis un vrai téléphone.

## 6. Déploiement (chaque étape compatible avec la précédente)

1. Migration de la base (ajouts seuls ; aucune conversation n'est
   `escalated` au 2026-09-27, donc aucun changement de comportement).
2. Soumission du template `reprise_conversation`.
3. n8n : workflow d'actions, puis workflow principal et points d'escalade.
4. Medusa : backend + admin, variables d'environnement de production.
5. Documentation : `n8n_automation/guide-golden-market-agent.md`, `AGENTS.md`
   des deux dépôts, `HANDOFF.md`.
