# Observabilité backend (GlitchTip self-hosted) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à Golden Market une capture d'erreurs backend en temps réel avec alertes et diagnostic de performance de base, via GlitchTip self-hosted, sur staging et production.

**Architecture:** Une instance GlitchTip partagée (web + worker + Postgres dédié) déployée dans le stack `production`, gatée par un profil Compose actif sur les deux environnements (contrairement à Matomo) puisque staging ET production doivent y envoyer leurs erreurs — mais une seule instance, jamais deux. Le backend Medusa (staging et production) intègre le SDK `@sentry/node` greffé sur le scaffold `instrumentation.ts` déjà présent, suivant exactement le guide officiel Medusa.

**Tech Stack:** GlitchTip (image officielle `glitchtip/glitchtip`), PostgreSQL 16 dédié, Redis (réutilise l'instance déjà présente dans le stack production), `@sentry/node` + `@sentry/opentelemetry-node`, OpenTelemetry (déjà scaffoldé), Apache reverse proxy + certbot.

**Spec:** `docs/superpowers/specs/2026-09-03-observabilite-backend-design.md`

## Global Constraints

- Self-hosted uniquement — aucun SaaS.
- Une seule instance GlitchTip, jamais deux (staging s'y connecte à distance).
- Aucune donnée fabriquée — vérifier avec de vraies erreurs déclenchées, jamais un dashboard maquillé.
- Capture d'erreur fire-and-forget : jamais bloquant pour une requête réelle du site si GlitchTip est indisponible.
- Jamais de trailer `Co-Authored-By: Claude` ; commentaires/commits/documentation en français ; pas de semicolons, double quotes, 2-space indent côté backend (`@medusajs/eslint-plugin`).
- Toujours committer sur `staging` d'abord, jamais directement sur `main`.
- Construction du workflow n8n pour les alertes WhatsApp : **hors périmètre**, prérequis externe documenté seulement.

---

## Vue d'ensemble des fichiers

- Modifier `apps/backend/package.json` — dépendances Sentry/OTel
- Modifier `apps/backend/instrumentation.ts` — intégration Sentry + registerOtel
- Créer `apps/backend/src/api/middlewares.ts` — capture d'erreur
- Modifier `apps/backend/.env.template` — `SENTRY_DSN`
- Modifier `docker-compose.prod.yml` — services `glitchtip`, `glitchtip-worker`, `glitchtip-db`
- Modifier `.env.deploy.example` — variables GlitchTip documentées
- Créer `deploy/apache/monitoring.golden-market.co.conf` — vhost (activation manuelle après DNS)
- Modifier `HANDOFF.md`

---

### Task 1: Dépendances et scaffold Sentry/OTel

**Files:**
- Modify: `apps/backend/package.json`
- Modify: `apps/backend/instrumentation.ts`

**Interfaces:** aucune (configuration d'initialisation, pas de code métier appelable).

- [x] **Step 1: Installer les dépendances**

Run: `cd apps/backend && npm install @sentry/node @opentelemetry/api @opentelemetry/exporter-trace-otlp-grpc @sentry/opentelemetry @opentelemetry/core@1.x @opentelemetry/sdk-trace-base@1.x @opentelemetry/semantic-conventions@1.x`

> **Correction post-exécution (2026-09-03) :** le guide officiel Medusa référence
> `@sentry/opentelemetry-node`, le pont OTel de l'ancien SDK Sentry v7 —
> incompatible avec `@sentry/node@^10.73.0` (Sentry est passé à une architecture
> OTel-native en v8+, ce package est retiré). Le paquet correct est
> `@sentry/opentelemetry` (déjà présent transitivement à la même version). Le
> Step 1 ci-dessus a été corrigé pour l'installer directement.

- [x] **Step 2: Écrire `instrumentation.ts`**

```typescript
// apps/backend/instrumentation.ts

// Observabilité backend (GlitchTip self-hosted, compatible protocole Sentry).
// Voir docs/superpowers/specs/2026-09-03-observabilite-backend-design.md.
//
// Le guide officiel Medusa (docs.medusajs.com/resources/integrations/guides/sentry)
// référence @sentry/opentelemetry-node, le pont OTel de l'ancien SDK Sentry v7 -
// incompatible avec @sentry/node v10 installé ici (Sentry est passé à une
// architecture OTel-native en v8+, ce package est retiré). Pattern actuel :
// "Using Your Existing OpenTelemetry Setup" de la doc Sentry v10
// (docs.sentry.io/platforms/javascript/guides/node/opentelemetry/custom-setup/),
// adapté pour brancher ses 4 briques (contextManager, sampler, spanProcessors,
// textMapPropagator) sur registerOtel (déjà scaffoldé par Medusa) plutôt que sur
// un NodeTracerProvider séparé - un seul NodeSDK doit exister, celui de Medusa.
//
// SENTRY_DSN absent (dev local, ou avant que l'instance GlitchTip existe) ->
// Sentry.init reçoit dsn: undefined, qui désactive silencieusement l'envoi
// (comportement documenté du SDK Sentry) - pas de branche conditionnelle à
// maintenir ici.
import * as Sentry from "@sentry/node"
import { registerOtel } from "@medusajs/medusa"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc"
import {
  SentryPropagator,
  SentrySampler,
  SentrySpanProcessor,
} from "@sentry/opentelemetry"

const sentryClient = Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Réduit par rapport à l'exemple officiel (1.0 = 100% des requêtes tracées) :
  // ce VPS a une marge disque tendue (voir spec), pas besoin de tracer chaque
  // requête pour repérer les endpoints lents.
  tracesSampleRate: process.env.SENTRY_DSN ? 0.2 : 0,
  // Le NodeSDK OpenTelemetry est celui de Medusa (registerOtel ci-dessous) - on
  // empêche Sentry.init de créer le sien en plus, qui entrerait en conflit.
  skipOpenTelemetrySetup: true,
})

export function register() {
  registerOtel({
    serviceName: "medusa",
    contextManager: new Sentry.SentryContextManager(),
    textMapPropagator: new SentryPropagator(),
    sampler: sentryClient ? new SentrySampler(sentryClient) : undefined,
    spanProcessors: [new SentrySpanProcessor()],
    traceExporter: new OTLPTraceExporter(),
    instrument: {
      http: true,
      workflows: true,
      query: true,
    },
  })

  if (process.env.SENTRY_DSN) {
    Sentry.validateOpenTelemetrySetup()
  }
}
```

- [x] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune erreur

- [x] **Step 4: Vérifier le démarrage local (sans SENTRY_DSN, doit rester silencieux)**

Run: `npx medusa develop` (ou observer le serveur déjà lancé redémarrer via le watcher)
Expected: le backend démarre normalement, aucune erreur liée à Sentry/OTel dans les logs (DSN absent en local -> désactivé silencieusement, comme documenté au Step 2)

- [x] **Step 5: Commit**

```bash
git add apps/backend/package.json apps/backend/package-lock.json apps/backend/instrumentation.ts
git commit -m "Active le scaffold Sentry/OpenTelemetry (GlitchTip)"
```

---

### Task 2: Middleware de capture d'erreur

**Files:**
- Create: `apps/backend/src/api/middlewares.ts`

**Interfaces:**
- Consumes: `Sentry` initialisé par Task 1 (import direct `@sentry/node`, pas de dépendance de fichier).
- Produces: rien de consommé par d'autres tasks — point d'entrée terminal (câblé automatiquement par Medusa via la convention de fichier `src/api/middlewares.ts`).

- [x] **Step 1: Vérifier qu'aucun `src/api/middlewares.ts` n'existe déjà**

Run: `test -f apps/backend/src/api/middlewares.ts && echo EXISTS || echo ABSENT`
Expected: `ABSENT` — si le fichier existe déjà, lire son contenu et fusionner ce step avec l'existant plutôt que l'écraser (ne jamais perdre un middleware déjà en place).

- [x] **Step 2: Écrire le middleware**

```typescript
// apps/backend/src/api/middlewares.ts
import {
  defineMiddlewares,
  errorHandler,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import * as Sentry from "@sentry/node"

const originalErrorHandler = errorHandler()

export default defineMiddlewares({
  errorHandler: (
    error: MedusaError | any,
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) => {
    Sentry.captureException(error)
    return originalErrorHandler(error, req, res, next)
  },
})
```

- [x] **Step 3: Typecheck et lint**

Run: `cd apps/backend && npx tsc --noEmit -p tsconfig.json && npx medusa lint`
Expected: aucune erreur

- [x] **Step 4: Vérification manuelle locale (déclencher une vraie erreur)**

Run: `curl -s http://localhost:9002/store/products/does-not-exist -H "x-publishable-api-key: <clé locale>"`
Expected: une réponse d'erreur HTTP normale côté client (comportement inchangé) ; dans les logs backend, aucun crash lié au middleware lui-même. `Sentry.captureException` est un no-op silencieux tant que `SENTRY_DSN` est absent (Task 1) - la vérification qu'une erreur remonte *réellement* dans GlitchTip se fait à la Task 6, une fois une vraie instance déployée.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/api/middlewares.ts
git commit -m "Ajoute la capture d'erreur Sentry/GlitchTip (middleware)"
```

---

### Task 3: Secrets et documentation d'environnement

**Files:**
- Modify: `apps/backend/.env.template`

**Interfaces:** aucune.

- [x] **Step 1: Ajouter la variable au template**

Ouvrir `apps/backend/.env.template`, après le bloc `MATOMO_API_TOKEN=`, ajouter :

```bash

# --- Observabilité backend (GlitchTip self-hosted) ---
# DSN du projet GlitchTip correspondant à CET environnement (staging vs
# production ont chacun leur propre projet/DSN, voir spec) - vide en dev
# local, désactive silencieusement la capture (voir instrumentation.ts).
SENTRY_DSN=
```

- [x] **Step 2: Commit**

```bash
git add apps/backend/.env.template
git commit -m "Documente SENTRY_DSN dans .env.template"
```

---

### Task 4: Infrastructure Docker — GlitchTip

**Files:**
- Modify: `docker-compose.prod.yml`
- Modify: `.env.deploy.example`

**Interfaces:** aucune (infrastructure).

- [x] **Step 1: Ajouter les services**

Dans `docker-compose.prod.yml`, ajouter avant la section `volumes:` finale (après les services Matomo) :

```yaml
  # Observabilité backend (GlitchTip self-hosted, compatible protocole Sentry) -
  # staging ET production, contrairement à Matomo (voir spec) : une seule
  # instance partagée, gatée par le profil "observability" pour ne tourner
  # qu'une fois (dans le stack production), le backend staging s'y connecte
  # à distance via SENTRY_DSN. Réutilise le Redis déjà présent dans ce stack
  # (base numérotée différente via REDIS_URL), pas de nouvelle instance Redis.
  glitchtip-db:
    image: postgres:16-alpine
    container_name: ${ENV_NAME}-golden-market-glitchtip-db
    restart: unless-stopped
    profiles: ["observability"]
    environment:
      POSTGRES_DB: ${GLITCHTIP_DB_NAME}
      POSTGRES_USER: ${GLITCHTIP_DB_USER}
      POSTGRES_PASSWORD: ${GLITCHTIP_DB_PASSWORD}
    volumes:
      - glitchtip_db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${GLITCHTIP_DB_USER} -d ${GLITCHTIP_DB_NAME}"]
      interval: 5s
      timeout: 5s
      retries: 10

  glitchtip:
    image: glitchtip/glitchtip:latest
    container_name: ${ENV_NAME}-golden-market-glitchtip
    restart: unless-stopped
    profiles: ["observability"]
    depends_on:
      glitchtip-db:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://${GLITCHTIP_DB_USER}:${GLITCHTIP_DB_PASSWORD}@glitchtip-db:5432/${GLITCHTIP_DB_NAME}
      SECRET_KEY: ${GLITCHTIP_SECRET_KEY}
      # Base Redis 1 (pas 0, déjà utilisée par le backend Medusa sur cette
      # même instance Redis partagée) - à revérifier au moment du déploiement
      # que 0 est bien la base du backend Medusa (voir DATABASE_URL du service
      # backend plus haut dans ce fichier).
      REDIS_URL: redis://redis:6379/1
      GLITCHTIP_DOMAIN: https://monitoring.golden-market.co
      DEFAULT_FROM_EMAIL: ${GLITCHTIP_FROM_EMAIL}
      EMAIL_URL: ${GLITCHTIP_EMAIL_URL}
      ENABLE_OBSERVABILITY_API: "false"
    ports:
      - "127.0.0.1:${GLITCHTIP_PORT}:8000"
    volumes:
      - glitchtip_uploads:/code/uploads

  glitchtip-worker:
    image: glitchtip/glitchtip:latest
    container_name: ${ENV_NAME}-golden-market-glitchtip-worker
    restart: unless-stopped
    profiles: ["observability"]
    command: ./bin/run-celery-with-beat.sh
    depends_on:
      glitchtip-db:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://${GLITCHTIP_DB_USER}:${GLITCHTIP_DB_PASSWORD}@glitchtip-db:5432/${GLITCHTIP_DB_NAME}
      SECRET_KEY: ${GLITCHTIP_SECRET_KEY}
      REDIS_URL: redis://redis:6379/1
      GLITCHTIP_DOMAIN: https://monitoring.golden-market.co
      DEFAULT_FROM_EMAIL: ${GLITCHTIP_FROM_EMAIL}
      EMAIL_URL: ${GLITCHTIP_EMAIL_URL}
```

Et dans la section `volumes:` finale, ajouter :

```yaml
  glitchtip_db_data:
  glitchtip_uploads:
```

**À vérifier pendant le déploiement (Task 6)** : le nom exact de la commande de
démarrage du worker (`./bin/run-celery-with-beat.sh`) et le port interne exposé par
le service web (`8000` supposé ici par analogie avec les déploiements communautaires
observés) n'ont pas été confirmés contre l'image `glitchtip/glitchtip:latest` réelle
au moment d'écrire ce plan - `docker logs` après le premier démarrage confirmera ou
infirmera ces deux valeurs, à corriger ici si besoin avant de continuer.

- [x] **Step 2: Documenter les nouvelles variables**

Ajouter à la fin de `.env.deploy.example` :

```bash

# --- Observabilité backend (GlitchTip self-hosted, staging + production) ---
# Contrairement à Matomo, ce bloc doit être décommenté dans le .env.deploy des
# DEUX environnements - une seule instance tourne (profil "observability" actif
# uniquement côté production, voir docker-compose.prod.yml), mais le backend
# staging doit connaître GLITCHTIP_PORT et le domaine public pour construire
# son propre SENTRY_DSN à distance.
# COMPOSE_PROFILES=analytics,observability   # production uniquement
# GLITCHTIP_PORT=9091
# GLITCHTIP_DB_NAME=glitchtip
# GLITCHTIP_DB_USER=glitchtip
# GLITCHTIP_DB_PASSWORD=change_me
# GLITCHTIP_SECRET_KEY=change_me_random_string
# GLITCHTIP_FROM_EMAIL=commandes@golden-market.co
# GLITCHTIP_EMAIL_URL=smtp://user:password@smtp.example.com:587
```

- [x] **Step 3: Vérifier que le fichier compose parse correctement**

Run:
```bash
ENV_NAME=test COMPOSE_PROJECT_NAME=test BACKEND_PORT=9999 STOREFRONT_PORT=9998 POSTGRES_DB=x POSTGRES_USER=x POSTGRES_PASSWORD=x NEXT_PUBLIC_MEDUSA_BACKEND_URL=x NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=x NEXT_PUBLIC_DEFAULT_REGION=bf NEXT_PUBLIC_BASE_URL=x MATOMO_PORT=9090 MATOMO_DB_NAME=m MATOMO_DB_USER=m MATOMO_DB_PASSWORD=x MATOMO_DB_ROOT_PASSWORD=x GLITCHTIP_PORT=9091 GLITCHTIP_DB_NAME=g GLITCHTIP_DB_USER=g GLITCHTIP_DB_PASSWORD=x GLITCHTIP_SECRET_KEY=x GLITCHTIP_FROM_EMAIL=x GLITCHTIP_EMAIL_URL=smtp://x:x@x:587 docker compose -f docker-compose.prod.yml --profile analytics --profile observability config --services
```
Expected: liste incluant `glitchtip`, `glitchtip-db`, `glitchtip-worker` en plus des services existants, sans erreur.

- [x] **Step 4: Commit**

```bash
git add docker-compose.prod.yml .env.deploy.example
git commit -m "Ajoute les services GlitchTip à docker-compose.prod.yml (profil observability)"
```

---

### Task 5: Vhost Apache (préparé, activation manuelle après DNS)

**Files:**
- Create: `deploy/apache/monitoring.golden-market.co.conf`

**Interfaces:** aucune.

**Contexte** : au moment d'écrire ce plan, `monitoring.golden-market.co` ne résout
vers aucune IP (même situation que `analytics.golden-market.co` pour Matomo,
toujours non résolu à cette date). Ce fichier est préparé et committé, son
activation (Steps 3-5) reste bloquée tant que ce DNS n'est pas ajouté par le
propriétaire.

- [x] **Step 1: Vérifier l'état du DNS avant de commencer**

Run: `dig +short monitoring.golden-market.co A` et `dig +short analytics.golden-market.co A`
Si l'un des deux résout déjà vers `144.91.110.105`, ajuster les steps suivants en
conséquence (l'activation peut être immédiate plutôt que différée).

- [x] **Step 2: Écrire le vhost**

```apache
<VirtualHost *:80>
    ServerName monitoring.golden-market.co

    ProxyPreserveHost On

    ProxyPass / http://127.0.0.1:9091/
    ProxyPassReverse / http://127.0.0.1:9091/

    ErrorLog ${APACHE_LOG_DIR}/monitoring-error.log
    CustomLog ${APACHE_LOG_DIR}/monitoring-access.log combined
</VirtualHost>
```

Le port `9091` correspond à `GLITCHTIP_PORT` dans `.env.deploy.example` (Task 4) - à
ajuster ici si une valeur différente est retenue au moment du déploiement réel.

- [x] **Step 3: Commit**

```bash
git add deploy/apache/monitoring.golden-market.co.conf
git commit -m "Prépare le vhost Apache monitoring.golden-market.co (activation manuelle après DNS)"
```

- [ ] **Step 4 (manuel, une fois le DNS ajouté) : copier le vhost et activer le site**

```bash
ssh admin@144.91.110.105 'sudo cp /opt/golden-market/production/deploy/apache/monitoring.golden-market.co.conf /etc/apache2/sites-available/ && sudo a2ensite monitoring.golden-market.co && sudo apache2ctl configtest && sudo apache2ctl graceful'
```

- [ ] **Step 5 (manuel) : certificat certbot**

```bash
ssh admin@144.91.110.105 'sudo certbot --apache -d monitoring.golden-market.co'
```

---

### Task 6: Déploiement, initialisation GlitchTip et connexion des deux environnements

**Files:** aucun nouveau fichier — déploiement des Tasks 1-5.

- [x] **Step 1: Vérification locale complète**

```bash
cd apps/backend && npx tsc --noEmit -p tsconfig.json && npx medusa lint && npx jest --silent=false
```
Expected: tout passe (les tests existants ne touchent pas à Sentry/GlitchTip, aucune régression attendue)

- [x] **Step 2: Générer les secrets réels**

```bash
openssl rand -base64 32   # GLITCHTIP_SECRET_KEY
openssl rand -base64 24   # GLITCHTIP_DB_PASSWORD
```
Jamais de valeur devinée ou de placeholder laissé en production.

- [x] **Step 3: Ajouter les variables au `.env.deploy` de production (SSH, manuel)**

```bash
ssh admin@144.91.110.105 'cat >> /opt/golden-market/production/.env.deploy <<EOF

COMPOSE_PROFILES=analytics,observability
GLITCHTIP_PORT=9091
GLITCHTIP_DB_NAME=glitchtip
GLITCHTIP_DB_USER=glitchtip
GLITCHTIP_DB_PASSWORD=<mot de passe généré Step 2>
GLITCHTIP_SECRET_KEY=<clé générée Step 2>
GLITCHTIP_FROM_EMAIL=commandes@golden-market.co
GLITCHTIP_EMAIL_URL=<URL SMTP réelle - reprendre RESEND_API_KEY/config email déjà en place côté backend si GlitchTip supporte le même fournisseur, sinon demander au propriétaire>
EOF'
```

**Point à trancher avant ce step** : GlitchTip a besoin d'un envoi d'email
fonctionnel pour les invitations d'équipe et certaines notifications - vérifier si
Resend (déjà utilisé par le backend Medusa, voir `RESEND_API_KEY` dans
`apps/backend/.env.template`) expose un endpoint SMTP compatible `EMAIL_URL`, sinon
signaler au propriétaire plutôt que d'inventer des identifiants SMTP.

- [x] **Step 4: Push staging, vérifier le déploiement vert, vérifier qu'aucun conteneur GlitchTip n'existe encore côté staging**

```bash
git push origin staging
```
Surveiller via `gh run watch <run-id> --exit-status`. Puis :
```bash
ssh admin@144.91.110.105 'docker ps --filter "name=staging" --format "table {{.Names}}"'
```
Expected : pas de `staging-golden-market-glitchtip*` (le profil `observability` n'est
actif que côté production).

- [x] **Step 5: Merge vers main, push, vérifier le déploiement production vert**

```bash
git checkout main && git merge staging --ff-only && git push origin main
```
Surveiller via `gh run watch <run-id> --exit-status`.

- [x] **Step 6: Vérifier que les conteneurs GlitchTip tournent en production**

```bash
ssh admin@144.91.110.105 'docker ps --filter "name=production-golden-market-glitchtip" --format "table {{.Names}}\t{{.Status}}"'
```
Expected: `glitchtip`, `glitchtip-db`, `glitchtip-worker` tous `Up` (`glitchtip-db`
`healthy`). Si un des deux points laissés ouverts à la Task 4 Step 1 (port interne,
commande worker) s'avère incorrect, `docker logs` du conteneur en échec le révélera
ici - corriger `docker-compose.prod.yml` en conséquence et redéployer avant de
continuer.

**Résultat réel (2026-09-03)** : les deux points laissés ouverts se sont avérés
**corrects** (port interne 8000 confirmé par le log `Listening at: http://0.0.0.0:8000`,
commande worker confirmée par les logs Celery+beat traitant `uptime-dispatch-checks`
en boucle). Un problème réel et différent est apparu à la place :

1. **`GLITCHTIP_DB_PASSWORD` généré via `openssl rand -base64 24` a cassé le parsing
   de `DATABASE_URL`** (`ValueError: Port could not be cast to integer value as
   '<fragment du mot de passe>'`) - l'alphabet base64 standard peut produire `/`,
   `+`, `=`, non sûrs tels quels dans une URL `postgres://user:PASS@host:port/db`
   sans encodage pourcent. Corrigé en régénérant avec `openssl rand -hex 24`
   (alphanumérique uniquement, donc sûr en URL) - `GLITCHTIP_SECRET_KEY` (Django,
   jamais dans une URL) n'a pas ce problème et reste en base64.
   Mot de passe aligné côté rôle Postgres (`ALTER USER glitchtip WITH PASSWORD
   ...` dans le conteneur `glitchtip-db`, transmis via scp + fichier temporaire
   détruit après usage, jamais affiché en clair) et côté `.env.deploy`, puis
   `glitchtip`/`glitchtip-worker` recréés.
2. **Aucune migration Django appliquée au premier démarrage** (l'image
   `glitchtip/glitchtip:latest` ne migre pas automatiquement au démarrage du
   service web) - le worker crashait en boucle sur `relation "uptime_monitor"
   does not exist`. Corrigé avec `docker exec production-golden-market-glitchtip
   ./manage.py migrate --noinput`, puis redémarrage du worker.

Après ces deux corrections : les 3 conteneurs stables (`Up`, `glitchtip-db`
`healthy`), logs propres des deux côtés.

- [x] **Step 7: Créer le compte super-admin GlitchTip**

```bash
ssh admin@144.91.110.105 'docker exec -it production-golden-market-glitchtip ./manage.py createsuperuser'
```
Un vrai mot de passe fort, saisi interactivement par le propriétaire ou la session
(jamais un mot de passe deviné/par défaut laissé tel quel).

**Note (2026-09-03)** : `docker exec -it` échoue dans cette session (pas de TTY
alloué - "cannot attach stdin to a TTY-enabled container because stdin is not a
terminal"). Délégué au propriétaire via `ssh -t ...` à exécuter directement dans
son terminal (préfixe `!` en session interactive Claude Code) plutôt qu'un mot de
passe généré et relayé par l'assistant.

- [x] **Step 8: Créer les deux organisations/projets et récupérer les DSN (via l'interface web, une fois le vhost actif - Task 5 Steps 4-5 complétées)**

Se connecter sur `https://monitoring.golden-market.co` avec le compte super-admin,
créer une organisation "Golden Market", puis deux projets : `staging-backend` et
`production-backend` (plateforme Node.js). Noter le DSN de chacun (Paramètres du
projet → Client Keys (DSN)).

**Si le DNS n'est pas encore prêt** : ce step reste bloqué (comme pour Matomo)
jusqu'à ce que le propriétaire ajoute l'enregistrement DNS - signaler l'écart plutôt
que d'inventer des DSN, et documenter le reste des steps comme prêts à exécuter dès
que ce blocage est levé.

**Résultat réel (2026-09-03)** : DNS propagé, vhosts `analytics`/`monitoring`
activés et certificats certbot obtenus par le propriétaire (délégué, même
limitation `sudo` interactif que Step 7). Organisation "Golden Market" et les
deux projets créés via `./manage.py shell` (ORM Django directement dans le
conteneur) plutôt que l'interface web - même résultat fonctionnel (mêmes
modèles, mêmes signaux de création de `ProjectKey`), pas de compte web utilisé
donc pas besoin des identifiants du super-admin créé au Step 7. DSN obtenus :
`staging-backend` → `https://<clé>@monitoring.golden-market.co/1`,
`production-backend` → `https://<clé>@monitoring.golden-market.co/2` (valeurs
réelles dans les `.env` respectifs, jamais committées).

- [x] **Step 9: Reporter les DSN dans les `.env` backend des deux environnements**

```bash
ssh admin@144.91.110.105 "echo 'SENTRY_DSN=<DSN production-backend>' >> /opt/golden-market/production/apps/backend/.env"
ssh admin@144.91.110.105 "echo 'SENTRY_DSN=<DSN staging-backend>' >> /opt/golden-market/staging/apps/backend/.env"
```

Puis redémarrer les deux backends pour qu'ils chargent la nouvelle variable :
```bash
ssh admin@144.91.110.105 'cd /opt/golden-market/production && docker compose -f docker-compose.prod.yml --env-file .env.deploy up -d backend'
ssh admin@144.91.110.105 'cd /opt/golden-market/staging && docker compose -f docker-compose.prod.yml --env-file .env.deploy up -d backend'
```

- [x] **Step 10: Vérification visuelle complète — déclencher une vraie erreur sur staging**

```bash
curl -s https://staging.golden-market.co/store/products/ce-produit-nexiste-pas -H "x-publishable-api-key: <clé staging>"
```
Puis vérifier dans `https://monitoring.golden-market.co`, projet `staging-backend`,
qu'une erreur réelle est apparue avec la vraie stack trace. Répéter la même
vérification côté production avec une requête qui ne modifie aucune donnée réelle
(même prudence que pour les commandes de test - ne jamais fabriquer de données,
mais une requête GET en erreur ne crée rien).

**Résultat réel (2026-09-03)** : vérifié par requête directe à la base GlitchTip
(`Issue.objects.filter(project=p)`, pas de session web disponible) plutôt que
via l'interface - une erreur 404 réelle (`Product with id: ... was not found`)
confirmée présente pour `staging-backend` **et** `production-backend`, avec le
bon titre et le bon horodatage. Vérification visuelle du dashboard laissée au
propriétaire (pas d'identifiants de connexion côté assistant, création faite en
ORM au Step 8).

- [x] **Step 11: Vérifier l'écran performance**

Naviguer sur le storefront (quelques pages, une recherche produit) pour générer du
trafic réel tracé, puis vérifier dans GlitchTip que des transactions HTTP
apparaissent avec des durées réelles.

**Résultat réel (2026-09-03)** : trafic réel généré (`GET /store/products` x15
par environnement, `tracesSampleRate` 0.2 donc échantillonnage partiel attendu).
Confirmé via `TransactionGroup` en base : `GET /store/products` présent des deux
côtés avec des durées réelles (214ms staging, 354ms production), plus des spans
internes réels (`redis-connect`, `redis-evalsha`, `workflow:create-defaults`).

- [ ] **Step 12: Mettre à jour HANDOFF.md**

Documenter le statut final : implémentation terminée, conteneurs déployés,
activation complète si le DNS était prêt, ou blocage DNS signalé avec la suite
exacte sinon (même format que la section Matomo équivalente). Rappeler explicitement
que le workflow n8n pour les alertes WhatsApp reste à construire séparément (hors
périmètre de ce dépôt) - documenter le format du payload webhook GlitchTip pour
faciliter ce branchement futur.

```bash
git add HANDOFF.md
git commit -m "Documente le déploiement de l'observabilité backend (GlitchTip)"
git push origin main
```

---

## Self-Review

**Couverture de la spec** : infra Docker (Task 4), domaine/reverse proxy (Task 5),
intégration backend staging+production (Tasks 1-3), gestion des erreurs (fire-and-forget
natif au SDK Sentry, pas de code défensif supplémentaire nécessaire), sauvegarde
(réutilise `backup-postgres.sh` existant - pas de nouvelle task, juste une ligne de
cron à ajouter au Step 12 ou en note manuelle si le propriétaire gère le crontab
lui-même comme pour les précédents), vérification (Task 6 Steps 10-11) — tout couvert.
Alertes webhook → n8n : explicitement documentées comme hors périmètre dans la spec,
reflété fidèlement ici (Task 6 Step 12 documente le format attendu plutôt que de
construire le workflow).

**Placeholders** : aucun "TODO"/"TBD" dans le code livré. Deux points explicitement
laissés ouverts avec justification (port interne GlitchTip et commande de démarrage
du worker, Task 4 ; DNS manquant, Tasks 5-6) - ce sont des inconnues réelles non
vérifiables sans accès à l'image Docker réelle ou au DNS réel, pas des trous évitables
dans le plan. Le point EMAIL_URL (Task 6 Step 3) est un vrai point de décision à
trancher avec le propriétaire plutôt qu'un oubli.

**Cohérence des types** : le middleware (Task 2) importe directement `@sentry/node`
sans dépendre d'un type exporté par Task 1 (Task 1 ne fait qu'initialiser Sentry au
niveau module, pas d'export consommé) - pas de risque de divergence de signature.

**Cron de sauvegarde GlitchTip** : non détaillé en task séparée (contrairement à
Matomo/MariaDB) car `glitchtip-db` est un Postgres standard - `deploy/backup-postgres.sh`
existant fonctionne tel quel, il suffit d'ajouter une ligne de crontab
`... backup-postgres.sh production-golden-market-glitchtip-db glitchtip glitchtip
/opt/golden-market/production/backups 30 ...` au même endroit que les lignes
existantes (Task 6 Step 12, à faire en même temps que la mise à jour de HANDOFF.md).
