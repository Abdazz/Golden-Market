# Visualisation des conversations WhatsApp dans l'admin Medusa

## Contexte

L'agent WhatsApp (workflow n8n, dépôt `n8n_automation`) persiste chaque
message échangé avec un client dans une base Postgres dédiée
(`golden_market`, hébergée par la stack `n8n_automation` sur le même VPS
que Medusa) : table `conversations` (une ligne par numéro de téléphone) et
table `messages` (historique complet, colonne `seq BIGSERIAL` ajoutée le
2026-09-05 pour garantir l'ordre réel d'insertion — voir `HANDOFF.md`).

Meta ne fournit aucune interface pour parcourir le contenu de ces
conversations : l'intégration passe par l'API Cloud WhatsApp en direct
(webhooks n8n), pas par un BSP ni par la boîte de réception Business Suite
— WhatsApp Manager n'expose que les modèles de messages et des statistiques
agrégées, jamais le contenu réel. La seule source de vérité exploitable
est donc cette base Postgres.

Ce document couvre la construction d'un outil interne, dans l'admin Medusa
existant, pour que le propriétaire consulte cet historique sans taper de
SQL à la main.

## Objectif

Permettre au propriétaire de :
1. voir la liste des conversations WhatsApp, triée par dernière activité ;
2. rechercher une conversation par numéro de téléphone ;
3. consulter le fil complet d'une conversation (ordre réel, rôle
   client/IA, horodatage).

## Non-objectifs (hors scope de ce document)

- Pagination avancée, export, filtres par date — à ajouter plus tard si le
  volume le justifie (YAGNI : le catalogue de conversations est encore
  jeune, la liste triée + recherche par numéro suffit aujourd'hui).
- Toute action d'écriture (répondre depuis l'admin, marquer comme lu,
  etc.) — l'outil est strictement un visualiseur en lecture seule.
- Disponibilité en local/staging : le chatbot WhatsApp ne sert que la
  production (un seul environnement n8n réel, pas de duplication
  staging), donc cet outil n'a de sens qu'en production.
- Modifier quoi que ce soit côté `n8n_automation` applicatif (workflows,
  logique de l'agent) — seul l'accès **lecture seule** à sa base de
  données est en jeu ici.

## Architecture

Trois composants côté `apps/backend` (Medusa), plus une dépendance
d'infra qui touche aussi le dépôt `n8n_automation`.

### 1. Client de connexion à la base `golden_market`

`apps/backend/src/lib/whatsapp-chat-db.ts`

Un simple `pg.Pool` (le driver `pg` est déjà une dépendance transitive de
Medusa/MikroORM ; sinon ajouté explicitement) instancié une fois, à partir
de la variable d'environnement `WHATSAPP_CHAT_DATABASE_URL`. Pas de module
Medusa complet (pas de migrations, pas d'écriture, pas de logique
métier à orchestrer) — un module serait une sur-ingénierie pour une simple
lecture de reporting.

Si `WHATSAPP_CHAT_DATABASE_URL` est absente (dev local, staging), le pool
n'est jamais créé et les fonctions de lecture retournent `null` /
lèvent une erreur explicite typée, à charge des routes admin de la
traduire en réponse « indisponible » plutôt qu'un crash — même pattern que
le widget d'analytics Matomo (`MATOMO_*` absent → « Statistiques
indisponibles pour le moment. »).

Deux fonctions exportées :
```ts
listConversations(search?: string): Promise<ConversationSummary[]>
getConversationMessages(phoneNumber: string): Promise<ChatMessage[]>
```

**Schéma réel confirmé** (lu directement dans `schema.sql` du dépôt
`n8n_automation`, tables du schéma `public` — ne jamais toucher au schéma
`n8n`, réservé aux données internes de n8n lui-même) :

```sql
-- public.conversations
id              UUID PRIMARY KEY
phone_number    TEXT NOT NULL UNIQUE   -- format E.164, ex: +22670000000
customer_name   TEXT
status          TEXT NOT NULL          -- 'active' | 'closed' | 'escalated'
last_message_at TIMESTAMPTZ NOT NULL
created_at      TIMESTAMPTZ NOT NULL

-- public.messages
id               UUID PRIMARY KEY
conversation_id  UUID NOT NULL REFERENCES conversations(id)
role             TEXT NOT NULL         -- 'user' | 'assistant' | 'system'
content          TEXT NOT NULL
whatsapp_msg_id  TEXT
seq              BIGSERIAL             -- ordre d'insertion réel, voir HANDOFF.md 2026-09-05
created_at       TIMESTAMPTZ NOT NULL
```

`listConversations` trie sur `last_message_at DESC`, filtre optionnellement
sur `phone_number ILIKE '%' || $1 || '%'`. L'aperçu du dernier message et
le nombre total de messages n'existent pas comme colonnes sur
`conversations` : ils viennent d'une jointure/sous-requête sur `messages`
(dernier par `seq DESC LIMIT 1` pour l'aperçu, `COUNT(*)` groupé par
`conversation_id` pour le total) — à faire en une seule requête SQL, pas
en N+1. `getConversationMessages` résout d'abord `conversations.id` par
`phone_number`, puis lit `messages` triés par `seq ASC` (jamais
`created_at` seul — deux messages d'un même tour partagent le même
`created_at`, c'est précisément le bug corrigé le 2026-09-05). `status` et
`customer_name` sont affichés dans la liste s'ils sont renseignés (le
premier n'est pas toujours à jour selon les workflows n8n existants — à
traiter comme une information indicative, pas comme un statut garanti
exact).

### 2. Routes admin

`apps/backend/src/api/admin/whatsapp-conversations/route.ts` — `GET`,
paramètre de requête optionnel `q` (recherche par numéro).

`apps/backend/src/api/admin/whatsapp-conversations/[phone]/route.ts` —
`GET`, retourne le fil complet d'une conversation.

Ces routes sont automatiquement protégées par l'authentification admin
Medusa (préfixe `/admin`, middleware framework déjà en place — même
mécanisme que celui qui a piégé la route `/store` du flux Meta, mais dans
le sens qui nous arrange ici). Aucun contrôle d'accès supplémentaire :
un seul compte admin existe aujourd'hui.

### 3. Page admin dédiée

`apps/backend/src/admin/routes/whatsapp-conversations/page.tsx`, via
l'Admin SDK Medusa (`defineRouteConfig`) — nouvel item de navigation
« Conversations WhatsApp » dans le menu latéral. Pas un widget greffé sur
une page existante : il n'y a pas d'entité Medusa (produit, commande) à
laquelle rattacher naturellement cette vue.

Deux écrans dans la même page (état local, pas de routing imbriqué) :
- **Liste** : champ de recherche par numéro, tableau (numéro, aperçu du
  dernier message, nombre de messages, date de dernière activité), clic
  sur une ligne → écran détail.
- **Détail** : fil de la conversation sélectionnée, un message par ligne
  (badge rôle client/IA, horodatage, contenu), bouton retour vers la
  liste.

Si l'appel aux routes admin renvoie « indisponible » (base non
configurée), la page affiche un message explicite au lieu d'une liste
vide silencieuse — pour ne pas laisser croire qu'il n'y a aucune
conversation.

## Connexion inter-stacks (infra VPS)

Confirmé en lisant `docker-compose.yml`/`AGENTS.md` de `n8n_automation` :
une seule base Postgres (`golden_market`), un seul conteneur
(`golden_market_postgres`), deux schémas (`n8n` pour n8n lui-même,
`public` pour les tables métier) — donc une seule connexion à établir, pas
de complexité multi-instance. Le conteneur Postgres est aujourd'hui sur le
réseau bridge `golden_market_net` (créé par ce compose, interne, **aucun
port publié sur l'hôte** — seul `n8n` expose `127.0.0.1:5678`).

Pour que le conteneur backend Medusa (production) atteigne
`golden_market_postgres` sans publier de port sur l'hôte (cohérent avec ce
choix déjà fait des deux côtés) :

1. Créer un réseau Docker externe sur le VPS :
   `docker network create golden_market_shared_net`.
2. Dans `docker-compose.yml` de `n8n_automation` : le service `postgres`
   rejoint ce réseau externe, en plus de `golden_market_net` (`networks:
   [golden_market_net, golden_market_shared_net]` + déclarer
   `golden_market_shared_net` comme `external: true` en bas du fichier).
3. Dans `docker-compose.prod.yml` de ce dépôt : le service `backend` de
   l'environnement production rejoint le même réseau externe. Le backend
   Medusa s'y connecte alors par le nom du conteneur —
   `golden_market_postgres` — comme hôte dans
   `WHATSAPP_CHAT_DATABASE_URL`.

Le point (2) est **hors de ce dépôt** : il doit être répliqué côté
`n8n_automation` (probablement une session Claude Code dédiée à ce dépôt,
avec ce document comme référence — dont l'`AGENTS.md` de `n8n_automation`
prévient explicitement : « Ne pas introduire un outil d'admin sans en
parler au préalable » ; ceci est déjà fait, le propriétaire a validé cette
spec).

## Sécurité — rôle Postgres dédié

Un rôle Postgres **lecture seule**, jamais `golden_market_admin` (le
compte applicatif n8n existant, qui a des droits d'écriture sur
`conversations`/`messages`) :

```sql
CREATE ROLE medusa_whatsapp_reader WITH LOGIN PASSWORD '<mot de passe fort, hex>';
GRANT CONNECT ON DATABASE golden_market TO medusa_whatsapp_reader;
GRANT USAGE ON SCHEMA public TO medusa_whatsapp_reader;
GRANT SELECT ON public.conversations, public.messages TO medusa_whatsapp_reader;
```

À exécuter sur `golden_market_postgres` (VPS) :
```bash
docker compose exec -T postgres psql -U golden_market_admin -d golden_market
```
(même pattern que la commande d'application du schéma déjà documentée
dans l'`AGENTS.md` de `n8n_automation`). Le mot de passe doit être généré
en hexadécimal (`openssl rand -hex 24`), pas en base64 — leçon déjà tirée
du secret GlitchTip cassé par des caractères `/+=` non sûrs en URL
(`HANDOFF.md`, 2026-09-03). Un bug ou une régression côté route admin ne
pourra donc jamais écrire ni corrompre les vraies données du chatbot en
production, quel que soit le code exécuté par ce rôle — et ne pourra
jamais lire ou modifier le schéma `n8n` (le `GRANT USAGE`/`SELECT` ne
porte que sur `public`).

## Gestion des erreurs

- Pool non configuré (`WHATSAPP_CHAT_DATABASE_URL` absente) : les routes
  admin renvoient un statut explicite (« non configuré »), jamais une
  erreur 500 générique — la page l'affiche clairement.
- Requête SQL en échec (réseau, rôle invalide) : `try/catch`, log
  `logger.error`, réponse « indisponible pour le moment » — jamais de
  crash de l'admin Medusa dans son ensemble pour une fonctionnalité
  annexe.

## Configuration

Nouvelle variable d'environnement (backend Medusa, **production
uniquement** — absente en local et staging par construction, le chatbot
n'existe qu'en production) :
- `WHATSAPP_CHAT_DATABASE_URL` — chaîne de connexion Postgres complète
  vers `golden_market`, avec le rôle `medusa_whatsapp_reader` créé
  ci-dessus : `postgres://medusa_whatsapp_reader:<pwd>@golden_market_postgres:5432/golden_market`
  (hôte = nom du conteneur, atteignable une fois les deux services sur
  `golden_market_shared_net`).

À documenter dans `apps/backend/.env.template` avec un commentaire
explicite sur son caractère production-only et sur l'exigence de lecture
seule du rôle utilisé.

## Tests

Suite unitaire (`apps/backend/src/lib/__tests__/whatsapp-chat-db.unit.spec.ts`
ou équivalent, convention Jest du projet) :
- pool non configuré → les fonctions renvoient l'état « indisponible »
  attendu, jamais de throw non catché ;
- requête réussie → mapping correct des lignes vers `ConversationSummary`
  / `ChatMessage` (client `pg` mocké) ;
- erreur de requête → catchée, log, pas de propagation en exception non
  gérée jusqu'à la route.

Vérification manuelle obligatoire une fois déployé (pas seulement les
tests) : une vraie conversation existante consultée dans l'admin
production, comparée à une requête SQL directe sur la même donnée — même
règle que pour toute donnée réelle sur ce projet.

## Étapes manuelles hors code

1. `docker network create golden_market_shared_net` sur le VPS.
2. Côté `n8n_automation` : ajouter `golden_market_shared_net` (externe)
   aux réseaux du service `postgres` dans `docker-compose.yml`, puis
   `docker compose up -d postgres` (changement dans ce dépôt-là, hors
   périmètre de cette spec, mais nécessaire avant que le point 4 ne
   fonctionne).
3. Exécuter le `CREATE ROLE` ci-dessus sur `golden_market_postgres`.
4. Dans `docker-compose.prod.yml` de ce dépôt : ajouter
   `golden_market_shared_net` (externe) au service `backend` de
   production, puis redéployer.
5. Renseigner `WHATSAPP_CHAT_DATABASE_URL` dans le `.env` backend de
   production sur le VPS (jamais commité).
