# Observabilité backend (GlitchTip self-hosted)

Spec validée par brainstorming le 2026-09-03. Sous-projet différé depuis le prompt de
reprise « observabilité et statistiques de visite » du 2026-09-02 (voir `HANDOFF.md`)
— traité après les statistiques de visite (Matomo), comme convenu avec le propriétaire.

## Contexte et décisions de périmètre

Aucune observabilité backend n'existe aujourd'hui. `apps/backend/instrumentation.ts`
contient le scaffold Medusa/OpenTelemetry par défaut, entièrement commenté (jamais
activé, aucun exporter choisi). Aucune erreur applicative n'est capturée nulle part en
dehors des logs Docker bruts (`docker logs`, perdus au redémarrage du conteneur).

Cadrage acté avec le propriétaire pendant le brainstorming :

- **Priorités** (les 2 retenues, sur 4 proposées) : être alerté en temps réel (pas
  seulement pouvoir consulter un dashboard si on y pense) et diagnostiquer les
  lenteurs/performances. La visibilité des erreurs elles-mêmes et un historique de
  logs consultable n'ont pas été retenus comme prioritaires en tant que tels, mais
  découlent naturellement de l'outil retenu (voir « Approches »).
- **Contrainte non négociable, reprise de Matomo** : self-hosted uniquement.
- **Environnements** : staging **et** production (contrairement à Matomo) — une
  erreur backend en staging est un vrai bug à corriger avant qu'il n'atteigne la
  production, alors qu'une visite staging n'est pas une vraie donnée d'audience.
  Une seule instance de l'outil (pas de duplication d'infrastructure), avec deux
  projets internes distincts (`staging-backend` / `production-backend`), chacun son
  propre DSN.
- **Sous-domaine dédié** accepté malgré le DNS `analytics.golden-market.co` déjà en
  attente côté propriétaire au moment de ce brainstorming — un deuxième
  enregistrement DNS à créer, en connaissance de cause.
- **Alertes** : le principe d'un webhook déclenché par GlitchTip est retenu, avec
  l'intention de le brancher sur le pipeline WhatsApp déjà utilisé pour les
  notifications de commande (n8n). La création du workflow n8n réel est explicitement
  **hors périmètre de ce dépôt** (vit dans `n8n_automation` ou l'UI n8n) — ce
  sous-projet prépare le point de branchement (URL de webhook configurable côté
  GlitchTip) sans construire le workflow n8n lui-même.

Contraintes d'infrastructure existantes (héritées de Matomo, revérifiées le
2026-09-03) :

- VPS unique, `/opt/golden-market/{staging,production}`, deux checkouts indépendants,
  un seul `docker-compose.prod.yml` partagé paramétré par `.env.deploy`.
- Marge VPS mesurée le 2026-09-03 (après ajout de Matomo/MariaDB) : ~5,9 Gio RAM
  disponible sur 11 Gio (quasiment inchangée malgré Matomo — Matomo + MariaDB ne
  consomment qu'environ 160 Mio à eux deux en usage réel), ~30 Gio disque libre sur
  197 Gio (**85 % utilisé, en légère hausse depuis Matomo** — le disque est la
  ressource la plus tendue de ce VPS, à surveiller pour tout ajout futur).
- Apache déjà en place comme reverse proxy pour tous les vhosts du VPS.

## Approches envisagées (pour mémoire)

1. **GlitchTip self-hosted (retenu)** — clone protocole-compatible Sentry, léger
   (~256-512 Mio RAM recommandés, Postgres + Redis optionnel), capture erreurs **et**
   performances de base (durées de transaction/requête, endpoints lents) via le SDK
   `@sentry/node`. Alertes par webhook natif (branchables sur n8n). Medusa a une doc
   d'intégration officielle exacte pour ce cas (`docs.medusajs.com/resources/
   integrations/guides/sentry`), qui se greffe directement sur le scaffold
   `instrumentation.ts` déjà présent - peu de code nouveau.
2. **Stack Grafana complète (Tempo + Loki + Grafana + Alertmanager) (écartée)** —
   tracing distribué plus profond et plus « standard de l'industrie », mais 4-5
   conteneurs au lieu de 2-3, empreinte RAM/disque nettement plus lourde, et inclut
   des logs centralisés (Loki) - besoin non prioritaire ici. Écartée pour rester
   proportionnée au besoin réel et à la marge disque tendue de ce VPS.
3. **Uptrace (écarté)** — se brancherait le plus directement sur le scaffold OTel
   existant (tracing natif OpenTelemetry). Mais son backend ClickHouse demande au
   minimum 8 Gio RAM pour un usage basique d'après sa documentation officielle -
   dépasse à lui seul toute la marge RAM disponible sur ce VPS partagé. Même nature
   d'écart que PostHog écarté pour Matomo : uniquement une question de
   dimensionnement, pas de qualité de l'outil.

## Architecture

### Infrastructure (Docker Compose)

Trois nouveaux services ajoutés à `docker-compose.prod.yml`, dans le stack
**production uniquement** (comme Matomo — une seule instance partagée, le backend
staging s'y connecte à distance via son DSN, pas de deuxième déploiement) :

- `glitchtip` — image officielle `glitchtip/glitchtip`, serveur web (Django).
- `glitchtip-worker` — même image, processus Celery (traitement asynchrone des
  events/alertes) - obligatoire même en configuration légère, ce n'est pas un
  service de scaling optionnel.
- `glitchtip-db` — Postgres dédié (pattern déjà en place pour `postgres` du backend
  Medusa - moteur déjà maîtrisé sur ce projet, pas de nouveau type de base comme pour
  Matomo/MariaDB).
- Redis : réutilise le `redis` déjà présent dans le stack production (pas une
  nouvelle instance - GlitchTip accepte une base Redis numérotée différente sur la
  même instance via `REDIS_URL`).

Contrairement à Matomo, **pas de profil Compose conditionnel** : GlitchTip doit
recevoir les erreurs de staging ET de production, donc le service tourne dès que le
stack production est démarré, indépendamment de l'environnement qui pousse des
erreurs dessus à un instant donné.

Volumes nommés pour les données Postgres de GlitchTip et les fichiers uploadés
(pièces jointes d'erreur, écrans de config GlitchTip) - même pattern que
`postgres_data`/`matomo_db_data`.

### Domaine et reverse proxy

Nouveau sous-domaine `monitoring.golden-market.co`, vhost Apache dédié + certificat
certbot, même procédure que pour `analytics.golden-market.co` - **bloqué sur le même
type de dépendance DNS**, à ajouter par le propriétaire chez son fournisseur DNS.
`ProxyPass`/`ProxyPassReverse` vers le port local du conteneur `glitchtip` (publié
uniquement sur `127.0.0.1`).

### Intégration backend (staging et production)

Suit exactement le guide officiel Medusa (« Integrate Sentry (Instrumentation) with
Medusa ») :

- Dépendances ajoutées à `apps/backend/package.json` : `@sentry/node`,
  `@opentelemetry/api`, `@opentelemetry/exporter-trace-otlp-grpc`,
  `@sentry/opentelemetry-node`, versions figées d'`@opentelemetry/core`,
  `@opentelemetry/sdk-trace-base`, `@opentelemetry/semantic-conventions`.
- `apps/backend/instrumentation.ts` complété : `Sentry.init({ dsn:
  process.env.SENTRY_DSN, tracesSampleRate: ..., instrumenter: "otel" })`, puis
  `registerOtel` (déjà scaffoldé) avec `spanProcessors: [new SentrySpanProcessor()]`
  et le même bloc `instrument: { http, workflows, query, db }` que le scaffold
  d'origine prévoyait déjà.
- Nouveau `apps/backend/src/api/middlewares.ts` : `errorHandler` custom qui appelle
  `Sentry.captureException(error)` puis délègue au handler d'erreur par défaut de
  Medusa (`errorHandler()` importé de `@medusajs/framework/http`) - ne remplace rien
  du comportement existant, ajoute juste la capture.
- `SENTRY_DSN` en variable d'environnement, **différente par environnement**
  (`apps/backend/.env` de staging pointe vers le projet `staging-backend`, celui de
  production vers `production-backend`) - documentée dans `.env.template`, jamais
  committée en valeur réelle. Absente en dev local (pas de bruit de développement
  dans GlitchTip).
- `tracesSampleRate` : valeur réduite en production (pas 1.0 comme l'exemple de la
  doc, qui trace 100 % des requêtes) pour rester léger sur un VPS à la marge disque
  déjà tendue - valeur exacte à trancher en écrivant le plan d'implémentation.

### Alertes

Côté GlitchTip : un « alert recipient » de type webhook configuré par projet
(`staging-backend`, `production-backend`), pointant vers une URL de webhook n8n à
créer. **La création de ce workflow n8n (déclencheur webhook → mise en forme →
message WhatsApp) est hors périmètre de ce sous-projet** - documentée comme
prérequis externe, avec le format du payload GlitchTip attendu pour faciliter ce
branchement, plutôt que construite ici.

### Gestion des erreurs

- **GlitchTip indisponible** : `Sentry.captureException` est asynchrone et
  fire-and-forget par conception (SDK Sentry standard) - un échec réseau vers
  GlitchTip ne bloque jamais une requête réelle du site, ni ne fait planter le
  backend.
- **Alerte webhook non configurée** (avant que le workflow n8n existe) : GlitchTip
  continue de fonctionner normalement en mode dashboard-only, aucune erreur côté
  backend Medusa.

### Sauvegarde

`glitchtip-db` est un Postgres standard - réutilise directement le script
`deploy/backup-postgres.sh` déjà existant (pas de nouveau script comme pour
Matomo/MariaDB), avec une nouvelle ligne de cron dédiée pointant sur le conteneur
`glitchtip-db`.

## Vérification / tests

- **Local** : les dépendances Sentry/OTel peuvent être testées en pointant
  temporairement `SENTRY_DSN` vers une instance GlitchTip locale temporaire (même
  pattern que le conteneur Matomo temporaire utilisé pour Matomo) ou, plus simple,
  vers un projet GlitchTip de test déjà déployé sur le VPS une fois disponible.
- **Vérification visuelle obligatoire** une fois déployé sur `staging` puis
  `production` : déclencher une vraie erreur (ex. route de test qui lève une
  exception, ou un cas d'erreur réel déjà connu), confirmer qu'elle apparaît dans le
  dashboard GlitchTip du bon projet avec la vraie stack trace, confirmer qu'une
  requête lente apparaît dans l'écran performance.
- Pas de test e2e Playwright applicable ici (sous-système purement backend, aucune
  interface storefront) - vérification par inspection directe du dashboard GlitchTip
  et des logs backend.

## Hors périmètre de ce sous-projet

- Construction du workflow n8n réel pour les alertes WhatsApp (prérequis externe
  documenté, pas construit ici).
- Tracing distribué approfondi façon Grafana Tempo/Uptrace (écarté à l'étape
  approches, pour raisons de dimensionnement VPS).
- Logs centralisés/consultables dans le temps (non prioritaire, écarté avec
  l'approche Grafana qui l'aurait inclus).
- Purge de rétention des données GlitchTip (à traiter si le disque redevient un
  problème réel, hors périmètre ici comme pour Matomo).
