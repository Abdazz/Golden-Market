# Phase 3 - Déploiement staging/production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produire tous les artefacts de déploiement (Dockerfiles, compose de déploiement, sauvegarde, vhosts Apache, CI/CD) pour faire tourner Golden Market en staging puis en production sur le VPS partagé avec `n8n_automation`.

**Architecture:** Un `docker-compose.prod.yml` unique à la racine, paramétré par un `.env.deploy` distinct par environnement (staging/production), builde et lance backend (Medusa) + storefront (Next.js) + Postgres + Redis dédiés et isolés. Apache (déjà en place sur le VPS) route `golden-market.co` et `staging.golden-market.co` vers ces conteneurs via `ProxyPass`. GitHub Actions déploie automatiquement sur push (`staging` → environnement staging, `main` → production).

**Tech Stack:** Docker / Docker Compose v2, Apache 2.4 (`mod_proxy`, `mod_headers`), certbot, GitHub Actions (`appleboy/ssh-action`), npm workspaces (Turborepo), Medusa v2, Next.js 15.

**Spec:** `docs/superpowers/specs/2026-08-27-phase3-deploiement-staging-production-design.md`

## Global Constraints

- npm est l'unique gestionnaire de paquets (`packageManager: npm@11.11.1` dans `package.json` racine) - jamais un autre.
- Jamais de tiret cadratin (—) dans le code, les commentaires ou les messages de commit - seulement `-`.
- Commentaires, messages de commit et documentation en français.
- Jamais de trailer `Co-Authored-By: Claude...` (ou toute IA) dans un commit.
- Ne jamais toucher à `apps/storefront/src/lib/data/`, à l'authentification, ou à la logique de calcul de prix/commande.
- Ne jamais merger de branche/PR ni pousser sur le dépôt distant sans consentement explicite de l'utilisateur, obtenu au moment précis de l'action.
- `.env` / `.env.local` / `.env.deploy` : jamais commités, jamais leur contenu réel écrit dans un fichier suivi par git (y compris ce plan et ses ledgers).
- `assertProductionConfig` (`apps/backend/src/lib/assert-production-config.ts`) ne se déclenche que si `NODE_ENV === "production"` - toute image Docker doit donc être construite sans cette variable pour rester no-op au build.

---

## Aperçu des fichiers touchés

- Créer : `.dockerignore`, `apps/backend/Dockerfile`, `apps/storefront/Dockerfile`, `docker-compose.prod.yml`, `.env.deploy.example`, `deploy/backup-postgres.sh`, `deploy/apache/golden-market.co.conf`, `deploy/apache/staging.golden-market.co.conf`, `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-production.yml`.
- Modifier : `.gitignore` (ajouter `.env.deploy`).
- Branche : créer `staging` (locale + distante).

Le `docker-compose.yml` existant à la racine (infra de dev local, Postgres/Redis uniquement) n'est **pas** touché.

---

### Task 1 : Créer la branche `staging`

**Files:**
- Aucun fichier - opération git uniquement.

- [ ] **Step 1 : Créer la branche localement depuis `main`**

```bash
git checkout main
git pull origin main
git checkout -b staging
```

- [ ] **Step 2 : Demander confirmation avant de pousser sur le dépôt distant**

Le push d'une nouvelle branche sur `origin` est une action visible côté distant - même si le principe d'une branche `staging` a déjà été validé par le propriétaire en amont de cette phase, confirmer explicitement avant ce push précis :

> "Je m'apprête à pousser la nouvelle branche `staging` sur `origin` (`git push -u origin staging`). Je continue ?"

- [ ] **Step 3 : Pousser après confirmation**

```bash
git push -u origin staging
```

- [ ] **Step 4 : Revenir sur `main` pour la suite du plan**

```bash
git checkout main
```

Les tâches suivantes (artefacts de déploiement) sont développées et committées sur `main` comme le reste de l'infra du dépôt (Dockerfiles/CI ne sont pas une feature applicative à faire transiter par `staging` avant `main` - c'est l'inverse qui est vrai après cette phase, pour le code applicatif).

---

### Task 2 : `.dockerignore` racine

**Files:**
- Create: `.dockerignore`

**Interfaces:**
- Produces: contexte de build filtré, consommé par `apps/backend/Dockerfile` et `apps/storefront/Dockerfile` (Task 3 et 4), tous deux utilisant `context: .` (racine du dépôt).

- [ ] **Step 1 : Écrire le fichier**

```
node_modules
**/node_modules
apps/backend/.medusa
apps/backend/static
apps/backend/.turbo
apps/backend/integration-tests
apps/storefront/.next
apps/storefront/.turbo
apps/storefront/tsconfig.tsbuildinfo
.git
.turbo
.remember
.claude
.superpowers
docs
*.md
**/.env
**/.env.local
.env.deploy
docker-compose.override.yml
```

- [ ] **Step 2 : Vérifier que le contexte de build exclut bien les fichiers sensibles**

```bash
docker build -f apps/backend/Dockerfile -t golden-market-dockerignore-check --target builder . 2>&1 | tail -5 || true
docker run --rm golden-market-dockerignore-check sh -c "find /app -maxdepth 2 -name '.env' -o -name '.env.local'" 2>/dev/null
```

Cette étape dépend du Dockerfile de la Task 3 (target `builder`) - à exécuter après la Task 3 si les tasks sont traitées dans l'ordre par un exécutant séquentiel ; sinon, revenir vérifier ce point une fois la Task 3 terminée. Attendu : aucune sortie (aucun `.env`/`.env.local` copié dans l'image).

- [ ] **Step 3 : Commit**

```bash
git add .dockerignore
git commit -m "Ajoute .dockerignore pour les builds Docker de déploiement"
```

---

### Task 3 : Dockerfile backend (Medusa)

**Files:**
- Create: `apps/backend/Dockerfile`

**Interfaces:**
- Consumes: `apps/backend/package.json` (script `build` = `medusa build`, sortie dans `.medusa/server`), `apps/backend/medusa-config.ts` (appelle `assertProductionConfig`, no-op tant que `NODE_ENV !== "production"`).
- Produces: image Docker exposant le port `9000`, démarrée via `npm run start` (`medusa start`) depuis `.medusa/server`. Consommée par `docker-compose.prod.yml` (Task 5, service `backend`).

- [ ] **Step 1 : Écrire le Dockerfile**

```dockerfile
# Construit sans NODE_ENV=production : `medusa build` charge medusa-config.ts,
# qui appelle assertProductionConfig (garde-fou Phase 2) - il ne doit pas se
# déclencher pendant le build. NODE_ENV=production n'est injecté qu'au runtime,
# via docker-compose.prod.yml, avec les vrais secrets de l'environnement ciblé.
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci
WORKDIR /app/apps/backend
RUN npm run build
WORKDIR /app/apps/backend/.medusa/server
RUN npm install --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/backend/.medusa/server ./
EXPOSE 9000
CMD ["npm", "run", "start"]
```

- [ ] **Step 2 : Builder l'image**

```bash
docker build -f apps/backend/Dockerfile -t golden-market-backend-test .
```

Attendu : build réussi (pas d'erreur `assertProductionConfig`, puisque `NODE_ENV` n'est jamais positionné à `production` dans ce Dockerfile).

- [ ] **Step 3 : Vérifier que le garde-fou se déclenche bien avec des secrets faibles au runtime**

```bash
docker run --rm \
  -e NODE_ENV=production \
  -e JWT_SECRET=supersecret \
  -e COOKIE_SECRET=supersecret \
  -e STORE_CORS=http://localhost:8000 \
  -e ADMIN_CORS=http://localhost:9000 \
  -e AUTH_CORS=http://localhost:9000 \
  golden-market-backend-test 2>&1 | tee /tmp/backend-test-weak.log
grep -q "n'est pas configuré pour la production" /tmp/backend-test-weak.log && echo "OK: garde-fou déclenché" || echo "ÉCHEC: le garde-fou aurait dû se déclencher"
```

Expected: `OK: garde-fou déclenché`, conteneur qui se termine en erreur.

- [ ] **Step 4 : Vérifier que des secrets forts passent ce garde-fou**

```bash
docker run --rm \
  -e NODE_ENV=production \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e COOKIE_SECRET="$(openssl rand -hex 32)" \
  -e STORE_CORS=https://golden-market.co \
  -e ADMIN_CORS=https://golden-market.co \
  -e AUTH_CORS=https://golden-market.co \
  golden-market-backend-test 2>&1 | tee /tmp/backend-test-strong.log
grep -q "n'est pas configuré pour la production" /tmp/backend-test-strong.log && echo "ÉCHEC: le garde-fou ne devrait plus se déclencher" || echo "OK: le garde-fou ne bloque plus (l'échec suivant, de connexion DB, est attendu et sera couvert par la Task 5)"
```

Expected: `OK: le garde-fou ne bloque plus...` - le conteneur peut échouer ensuite faute de base de données réelle (`DATABASE_URL` absent), c'est attendu à ce stade ; le test complet avec Postgres/Redis réels est couvert par la Task 5.

- [ ] **Step 5 : Commit**

```bash
git add apps/backend/Dockerfile
git commit -m "Ajoute le Dockerfile de production du backend Medusa"
```

---

### Task 4 : Dockerfile storefront (Next.js)

**Files:**
- Create: `apps/storefront/Dockerfile`

**Interfaces:**
- Consumes: `apps/storefront/check-env-variables.js` (échoue si `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` ou `NEXT_PUBLIC_DEFAULT_REGION` absentes), `apps/storefront/package.json` (`build` = `next build`, `start` = `next start -p 8000`).
- Produces: image Docker exposant le port `8000`, avec les 4 variables `NEXT_PUBLIC_*` gravées dans le bundle au build. Consommée par `docker-compose.prod.yml` (Task 5, service `storefront`, via `build.args`).

- [ ] **Step 1 : Écrire le Dockerfile**

```dockerfile
# Next.js grave les variables NEXT_PUBLIC_* dans le bundle client au moment du
# build (pas au runtime) : elles doivent donc être passées en --build-arg, avec
# des valeurs différentes pour staging et production (backend et clé publishable
# distincts par environnement - voir docker-compose.prod.yml).
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_DEFAULT_REGION
ARG NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=${NEXT_PUBLIC_MEDUSA_BACKEND_URL} \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY} \
    NEXT_PUBLIC_DEFAULT_REGION=${NEXT_PUBLIC_DEFAULT_REGION} \
    NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL}
WORKDIR /app/apps/storefront
RUN npm run build
EXPOSE 8000
CMD ["npm", "run", "start"]
```

- [ ] **Step 2 : Builder l'image avec des build-args de test**

```bash
docker build -f apps/storefront/Dockerfile \
  --build-arg NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://staging.golden-market.co \
  --build-arg NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_test_dockerfile_check \
  --build-arg NEXT_PUBLIC_DEFAULT_REGION=bf \
  --build-arg NEXT_PUBLIC_BASE_URL=https://staging.golden-market.co \
  -t golden-market-storefront-test .
```

Expected: build réussi (`check-env-variables.js` ne doit pas faire échouer `next build`, les 4 variables étant fournies).

- [ ] **Step 3 : Vérifier que les variables sont bien gravées dans le bundle**

```bash
docker run --rm golden-market-storefront-test sh -c "grep -rl 'pk_test_dockerfile_check' .next/ | head -1"
```

Expected: au moins un chemin de fichier affiché (preuve que la clé de test a été inlineée dans le build client - confirme que les `--build-arg` atteignent bien `next build`).

- [ ] **Step 4 : Commit**

```bash
git add apps/storefront/Dockerfile
git commit -m "Ajoute le Dockerfile de production du storefront Next.js"
```

---

### Task 5 : `docker-compose.prod.yml` + template `.env.deploy.example`

**Files:**
- Create: `docker-compose.prod.yml`, `.env.deploy.example`
- Modify: `.gitignore` (ajouter `.env.deploy`)

**Interfaces:**
- Consumes: `apps/backend/Dockerfile` (Task 3), `apps/storefront/Dockerfile` (Task 4), `apps/backend/.env` (existant, secrets applicatifs), `.env.deploy` (nouveau, variables d'infra : `ENV_NAME`, `COMPOSE_PROJECT_NAME`, `BACKEND_PORT`, `STOREFRONT_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, `NEXT_PUBLIC_DEFAULT_REGION`, `NEXT_PUBLIC_BASE_URL`).
- Produces: la stack complète (`postgres`, `redis`, `backend`, `storefront`) que la Task 6 (sauvegarde) et le runbook VPS final consomment.

- [ ] **Step 1 : Écrire `docker-compose.prod.yml`**

```yaml
# Stack de déploiement Golden Market (staging et production). Fichier unique
# partagé entre les deux environnements : le nom des conteneurs, les ports
# publiés et les variables NEXT_PUBLIC_* viennent de .env.deploy (un fichier
# distinct par environnement, jamais commité - voir .env.deploy.example).
# N'affecte pas docker-compose.yml (infra de dev local, backend/storefront
# natifs), inchangé.
services:
  postgres:
    image: postgres:16-alpine
    container_name: ${ENV_NAME}-golden-market-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: ${ENV_NAME}-golden-market-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    container_name: ${ENV_NAME}-golden-market-backend
    build:
      context: .
      dockerfile: apps/backend/Dockerfile
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file:
      - apps/backend/.env
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      REDIS_URL: redis://redis:6379
    ports:
      - "127.0.0.1:${BACKEND_PORT}:9000"

  storefront:
    container_name: ${ENV_NAME}-golden-market-storefront
    build:
      context: .
      dockerfile: apps/storefront/Dockerfile
      args:
        NEXT_PUBLIC_MEDUSA_BACKEND_URL: ${NEXT_PUBLIC_MEDUSA_BACKEND_URL}
        NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: ${NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY}
        NEXT_PUBLIC_DEFAULT_REGION: ${NEXT_PUBLIC_DEFAULT_REGION}
        NEXT_PUBLIC_BASE_URL: ${NEXT_PUBLIC_BASE_URL}
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "127.0.0.1:${STOREFRONT_PORT}:8000"

volumes:
  postgres_data:
  redis_data:
```

Note : `DATABASE_URL` et `REDIS_URL` sont fixés explicitement dans `environment:` (qui l'emporte sur `env_file:` en cas de doublon) - les lignes correspondantes dans `apps/backend/.env` restent vides/ignorées pour un déploiement Docker, la base de vérité étant `.env.deploy` (`POSTGRES_*`).

- [ ] **Step 2 : Écrire `.env.deploy.example`**

```
# Copier en .env.deploy (jamais commité) et remplir - un fichier distinct par
# répertoire de déploiement (staging vs production sur le VPS).

# staging ou production - préfixe les noms de conteneurs (docker ps)
ENV_NAME=staging
# distinct par environnement pour isoler réseau/volumes Docker Compose
COMPOSE_PROJECT_NAME=golden-market-staging

# Ports publiés sur 127.0.0.1 uniquement (Apache route depuis là)
BACKEND_PORT=9010
STOREFRONT_PORT=8010

# Postgres dédié à cet environnement
POSTGRES_DB=golden_market_staging
POSTGRES_USER=medusa
POSTGRES_PASSWORD=change_me

# Gravées dans le bundle Next.js au build (voir apps/storefront/Dockerfile)
NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://staging.golden-market.co
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=
NEXT_PUBLIC_DEFAULT_REGION=bf
NEXT_PUBLIC_BASE_URL=https://staging.golden-market.co
```

- [ ] **Step 3 : Ajouter `.env.deploy` au `.gitignore`**

Dans `.gitignore`, sous la section "Local env files" existante, ajouter une ligne :

```
.env.deploy
```

- [ ] **Step 4 : Test bout en bout local de la stack complète**

Choisir des ports de test qui n'entrent en conflit ni avec le stack de dev (`8002`/`9002`/`5440`/`6379`) ni avec rien d'autre :

```bash
ss -tlnp | grep -E ':18000|:19000' || echo "ports libres"
```

Créer un répertoire de test isolé et les fichiers d'environnement (jamais commités) :

```bash
mkdir -p /tmp/golden-market-compose-test
cp docker-compose.prod.yml /tmp/golden-market-compose-test/
cd /tmp/golden-market-compose-test
cat > .env.deploy <<'EOF'
ENV_NAME=test
COMPOSE_PROJECT_NAME=golden-market-compose-test
BACKEND_PORT=19000
STOREFRONT_PORT=18000
POSTGRES_DB=golden_market_test
POSTGRES_USER=medusa
POSTGRES_PASSWORD=test_password_local_only
NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:19000
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_test_compose_check
NEXT_PUBLIC_DEFAULT_REGION=bf
NEXT_PUBLIC_BASE_URL=http://localhost:18000
EOF
mkdir -p apps/backend
cat > apps/backend/.env <<'EOF'
JWT_SECRET=test_jwt_secret_at_least_32_characters_long
COOKIE_SECRET=test_cookie_secret_at_least_32_chars
STORE_CORS=http://localhost:18000
ADMIN_CORS=http://localhost:19000
AUTH_CORS=http://localhost:19000
ORANGE_MONEY_NUMBER=00 00 00 00
ORANGE_MONEY_NAME=Test
RESEND_API_KEY=re_test
RESEND_FROM_EMAIL=test@example.com
STOREFRONT_URL=http://localhost:18000
EOF
```

Puis, depuis le dépôt (répertoire réel du projet, pas `/tmp`, car il faut le vrai contexte de build) :

```bash
cd /home/yulcom/web/perso/Golden-Market
docker compose -f docker-compose.prod.yml --env-file /tmp/golden-market-compose-test/.env.deploy -p golden-market-compose-test up -d --build
```

Attendre que les services soient sains (`docker compose -f docker-compose.prod.yml -p golden-market-compose-test ps`), puis vérifier :

```bash
# Backend répond
curl -sf http://127.0.0.1:19000/health && echo " OK backend"

# Storefront répond (redirection vers /bf attendue, NEXT_PUBLIC_DEFAULT_REGION=bf)
curl -sI http://127.0.0.1:18000/ | grep -i "location: /bf" && echo "OK storefront"

# Postgres et Redis ne publient aucun port sur l'hôte
docker port golden-market-compose-test-golden-market-postgres 2>&1 | grep -q "." && echo "ÉCHEC: port publié" || echo "OK: aucun port publié (postgres)"
docker port golden-market-compose-test-golden-market-redis 2>&1 | grep -q "." && echo "ÉCHEC: port publié" || echo "OK: aucun port publié (redis)"

# Migrations
docker compose -f docker-compose.prod.yml -p golden-market-compose-test exec -T backend npm exec medusa db:migrate
```

Expected : les deux `curl` réussissent, les deux vérifications de port affichent "OK: aucun port publié", les migrations s'exécutent sans erreur.

- [ ] **Step 5 : Nettoyer le test**

```bash
docker compose -f docker-compose.prod.yml -p golden-market-compose-test down -v
rm -rf /tmp/golden-market-compose-test
```

- [ ] **Step 6 : Commit**

```bash
git add docker-compose.prod.yml .env.deploy.example .gitignore
git commit -m "Ajoute le compose de déploiement staging/production et son template .env.deploy"
```

---

### Task 6 : Script de sauvegarde Postgres avec rétention

**Files:**
- Create: `deploy/backup-postgres.sh`

**Interfaces:**
- Consumes: un conteneur Postgres en cours d'exécution (nommé `${ENV_NAME}-golden-market-postgres` par la Task 5).
- Produces: des fichiers `<db>-<timestamp>.sql.gz` dans un répertoire de sauvegarde, purgés au-delà de la rétention - installé en cron sur le VPS (runbook final, hors périmètre subagent).

- [ ] **Step 1 : Écrire le script**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Sauvegarde d'un conteneur Postgres de déploiement (staging ou production) et
# purge des dumps plus vieux que RETENTION_DAYS.
# Usage : backup-postgres.sh <container_name> <postgres_user> <postgres_db> <backup_dir> <retention_days>

if [ "$#" -ne 5 ]; then
  echo "Usage: $0 <container_name> <postgres_user> <postgres_db> <backup_dir> <retention_days>" >&2
  exit 1
fi

CONTAINER_NAME="$1"
POSTGRES_USER="$2"
POSTGRES_DB="$3"
BACKUP_DIR="$4"
RETENTION_DAYS="$5"

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y-%m-%dT%H-%M-%S)"
DUMP_FILE="${BACKUP_DIR}/${POSTGRES_DB}-${TIMESTAMP}.sql.gz"

docker exec "$CONTAINER_NAME" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$DUMP_FILE"

find "$BACKUP_DIR" -name "${POSTGRES_DB}-*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
```

- [ ] **Step 2 : Rendre le script exécutable**

```bash
chmod +x deploy/backup-postgres.sh
```

- [ ] **Step 3 : Tester le dump contre un Postgres réel (celui du test de la Task 5, relancé pour ce test)**

```bash
docker run -d --name backup-test-postgres \
  -e POSTGRES_DB=backup_test -e POSTGRES_USER=medusa -e POSTGRES_PASSWORD=test \
  postgres:16-alpine
sleep 3
mkdir -p /tmp/golden-market-backup-test
./deploy/backup-postgres.sh backup-test-postgres medusa backup_test /tmp/golden-market-backup-test 7
ls /tmp/golden-market-backup-test/backup_test-*.sql.gz && echo "OK: dump créé"
gzip -t /tmp/golden-market-backup-test/backup_test-*.sql.gz && echo "OK: dump valide (gzip -t)"
```

Expected : un fichier `.sql.gz` non vide et valide.

- [ ] **Step 4 : Tester la purge par rétention**

```bash
touch -d "10 days ago" /tmp/golden-market-backup-test/backup_test-fake-old.sql.gz
touch -d "1 day ago" /tmp/golden-market-backup-test/backup_test-fake-recent.sql.gz
./deploy/backup-postgres.sh backup-test-postgres medusa backup_test /tmp/golden-market-backup-test 7
ls /tmp/golden-market-backup-test/ | grep -q "fake-old" && echo "ÉCHEC: le vieux dump aurait dû être purgé" || echo "OK: vieux dump purgé"
ls /tmp/golden-market-backup-test/ | grep -q "fake-recent" && echo "OK: dump récent conservé" || echo "ÉCHEC: le dump récent n'aurait pas dû être purgé"
```

Expected : `OK: vieux dump purgé` et `OK: dump récent conservé`.

- [ ] **Step 5 : Nettoyer le test**

```bash
docker rm -f backup-test-postgres
rm -rf /tmp/golden-market-backup-test
```

- [ ] **Step 6 : Commit**

```bash
git add deploy/backup-postgres.sh
git commit -m "Ajoute le script de sauvegarde Postgres avec rétention par environnement"
```

---

### Task 7 : Templates de VirtualHost Apache

**Files:**
- Create: `deploy/apache/golden-market.co.conf`, `deploy/apache/staging.golden-market.co.conf`

**Interfaces:**
- Consumes: les ports publiés par `docker-compose.prod.yml` (Task 5) - `9000`/`8000` en production, `9010`/`8010` en staging (valeurs de `.env.deploy`, cohérentes avec `.env.deploy.example`).
- Produces: fichiers à copier manuellement dans `/etc/apache2/sites-available/` sur le VPS (runbook final) - jamais appliqués automatiquement à l'Apache système de cette machine de dev.

- [ ] **Step 1 : Écrire le vhost production**

```apache
<VirtualHost *:80>
    ServerName golden-market.co

    # Écrase X-Forwarded-For (ne l'ajoute pas en liste) : condition nécessaire
    # pour que le rate limiting par IP de la Phase 2
    # (POST /auth/customer/emailpass/reset-password) ne soit pas contournable
    # par un client qui usurpe cet en-tête.
    RequestHeader set X-Forwarded-For %{REMOTE_ADDR}s
    RequestHeader set X-Forwarded-Proto "http"

    ProxyPreserveHost On

    ProxyPass /admin http://127.0.0.1:9000/admin
    ProxyPassReverse /admin http://127.0.0.1:9000/admin
    ProxyPass /store http://127.0.0.1:9000/store
    ProxyPassReverse /store http://127.0.0.1:9000/store
    ProxyPass /auth http://127.0.0.1:9000/auth
    ProxyPassReverse /auth http://127.0.0.1:9000/auth
    ProxyPass /app http://127.0.0.1:9000/app
    ProxyPassReverse /app http://127.0.0.1:9000/app

    ProxyPass / http://127.0.0.1:8000/
    ProxyPassReverse / http://127.0.0.1:8000/

    ErrorLog ${APACHE_LOG_DIR}/golden-market-error.log
    CustomLog ${APACHE_LOG_DIR}/golden-market-access.log combined
</VirtualHost>
```

- [ ] **Step 2 : Écrire le vhost staging (mêmes règles, autre domaine et ports)**

```apache
<VirtualHost *:80>
    ServerName staging.golden-market.co

    RequestHeader set X-Forwarded-For %{REMOTE_ADDR}s
    RequestHeader set X-Forwarded-Proto "http"

    ProxyPreserveHost On

    ProxyPass /admin http://127.0.0.1:9010/admin
    ProxyPassReverse /admin http://127.0.0.1:9010/admin
    ProxyPass /store http://127.0.0.1:9010/store
    ProxyPassReverse /store http://127.0.0.1:9010/store
    ProxyPass /auth http://127.0.0.1:9010/auth
    ProxyPassReverse /auth http://127.0.0.1:9010/auth
    ProxyPass /app http://127.0.0.1:9010/app
    ProxyPassReverse /app http://127.0.0.1:9010/app

    ProxyPass / http://127.0.0.1:8010/
    ProxyPassReverse / http://127.0.0.1:8010/

    ErrorLog ${APACHE_LOG_DIR}/golden-market-staging-error.log
    CustomLog ${APACHE_LOG_DIR}/golden-market-staging-access.log combined
</VirtualHost>
```

- [ ] **Step 3 : Vérifier la syntaxe localement, sans toucher à l'Apache système**

Construire une config Apache minimale et autonome (fichiers temporaires uniquement, ne modifie ni ne recharge l'Apache installé sur cette machine) qui inclut le vhost à tester :

```bash
mkdir -p /tmp/apache-syntax-check
cat > /tmp/apache-syntax-check/test.conf <<'EOF'
ServerRoot /tmp/apache-syntax-check
PidFile /tmp/apache-syntax-check/test.pid
ErrorLog /tmp/apache-syntax-check/error.log
Listen 8099
Include /etc/apache2/mods-available/proxy.load
Include /etc/apache2/mods-available/proxy_http.load
Include /etc/apache2/mods-available/headers.load
Include /home/yulcom/web/perso/Golden-Market/deploy/apache/golden-market.co.conf
EOF
apache2ctl -t -f /tmp/apache-syntax-check/test.conf
```

Expected : `Syntax OK`. Répéter avec `staging.golden-market.co.conf` en changeant le dernier `Include`.

```bash
sed -i 's/golden-market.co.conf/staging.golden-market.co.conf/' /tmp/apache-syntax-check/test.conf
apache2ctl -t -f /tmp/apache-syntax-check/test.conf
```

Expected : `Syntax OK`.

- [ ] **Step 4 : Nettoyer**

```bash
rm -rf /tmp/apache-syntax-check
```

- [ ] **Step 5 : Commit**

```bash
git add deploy/apache/golden-market.co.conf deploy/apache/staging.golden-market.co.conf
git commit -m "Ajoute les templates de VirtualHost Apache pour staging et production"
```

---

### Task 8 : Workflows GitHub Actions de déploiement

**Files:**
- Create: `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-production.yml`

**Interfaces:**
- Consumes: secrets GitHub Actions `VPS_HOST`, `VPS_SSH_USER` (`admin`, voir spec), `VPS_SSH_PRIVATE_KEY` - configurés manuellement sur le dépôt GitHub, hors périmètre de cette tâche (voir runbook final).
- Produces: déploiement automatique sur push, consommé par le runbook de vérification final (critère de la spec : "push sur staging/main déclenche le déploiement correspondant").

- [ ] **Step 1 : Écrire le workflow staging**

```yaml
name: Déploiement staging

on:
  push:
    branches: [staging]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Déployer sur le VPS (staging)
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_SSH_USER }}
          key: ${{ secrets.VPS_SSH_PRIVATE_KEY }}
          script: |
            set -euo pipefail
            cd /opt/golden-market/staging
            git fetch origin staging
            git reset --hard origin/staging
            docker compose -f docker-compose.prod.yml --env-file .env.deploy build
            docker compose -f docker-compose.prod.yml --env-file .env.deploy up -d
            docker compose -f docker-compose.prod.yml --env-file .env.deploy exec -T backend npm exec medusa db:migrate
```

- [ ] **Step 2 : Écrire le workflow production**

```yaml
name: Déploiement production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Déployer sur le VPS (production)
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_SSH_USER }}
          key: ${{ secrets.VPS_SSH_PRIVATE_KEY }}
          script: |
            set -euo pipefail
            cd /opt/golden-market/production
            git fetch origin main
            git reset --hard origin/main
            docker compose -f docker-compose.prod.yml --env-file .env.deploy build
            docker compose -f docker-compose.prod.yml --env-file .env.deploy up -d
            docker compose -f docker-compose.prod.yml --env-file .env.deploy exec -T backend npm exec medusa db:migrate
```

- [ ] **Step 3 : Valider la syntaxe YAML**

```bash
python3 -c "
import yaml
for f in ['.github/workflows/deploy-staging.yml', '.github/workflows/deploy-production.yml']:
    with open(f) as fh:
        yaml.safe_load(fh)
    print(f, 'OK')
"
```

Expected : `OK` pour les deux fichiers (aucune exception levée par `yaml.safe_load`).

- [ ] **Step 4 : Commit**

```bash
git add .github/workflows/deploy-staging.yml .github/workflows/deploy-production.yml
git commit -m "Ajoute les workflows GitHub Actions de déploiement staging et production"
```

---

## Runbook manuel VPS (hors exécution automatisée par subagent)

Cette section n'est **pas** une suite de tâches à dispatcher à un subagent : elle touche le VPS partagé avec `n8n_automation`, des secrets réels, et le DNS/TLS. Chaque étape irréversible ou touchant l'infra partagée doit être confirmée explicitement avec le propriétaire au moment de l'exécuter, en session interactive.

1. **Créer les répertoires de déploiement et cloner le dépôt**
   ```bash
   sudo mkdir -p /opt/golden-market/staging /opt/golden-market/production
   sudo chown admin:admin /opt/golden-market/staging /opt/golden-market/production
   cd /opt/golden-market/staging && git clone -b staging git@github.com:Abdazz/Golden-Market.git .
   cd /opt/golden-market/production && git clone -b main git@github.com:Abdazz/Golden-Market.git .
   ```
2. **Créer `.env.deploy` et `apps/backend/.env` dans chaque répertoire**, à partir de `.env.deploy.example` et `apps/backend/.env.template`, avec les vraies valeurs de chaque environnement (secrets forts générés, `ORANGE_MONEY_NUMBER`/`RESEND_API_KEY` de test fournis par le propriétaire pour staging - jamais générés ni devinés, jamais écrits dans un fichier suivi par git).
3. **Premier démarrage de chaque stack** :
   ```bash
   cd /opt/golden-market/staging
   docker compose -f docker-compose.prod.yml --env-file .env.deploy up -d --build
   docker compose -f docker-compose.prod.yml --env-file .env.deploy exec -T backend npm exec medusa db:migrate
   docker compose -f docker-compose.prod.yml --env-file .env.deploy exec -T backend npm exec medusa user -e <admin-staging> -p <mot-de-passe>
   ```
   Répéter pour `/opt/golden-market/production` après validation explicite du staging par le propriétaire.
4. **Installer les VirtualHosts Apache** : copier `deploy/apache/*.conf` dans `/etc/apache2/sites-available/`, `sudo a2enmod proxy proxy_http headers`, `sudo a2ensite golden-market.co staging.golden-market.co`, `sudo apache2ctl configtest`, `sudo systemctl reload apache2`.
5. **TLS** : `sudo certbot --apache -d golden-market.co -d staging.golden-market.co`. Après coup, relire le vhost `-le-ssl.conf` généré par certbot pour chaque domaine et confirmer que la directive `RequestHeader set X-Forwarded-For %{REMOTE_ADDR}s` y est bien présente (certbot duplique en principe les directives du vhost `:80` vers le vhost `:443`, mais c'est un point de la spec à vérifier explicitement, pas à supposer).
6. **Secrets GitHub Actions** : `gh secret set VPS_HOST`, `gh secret set VPS_SSH_USER` (`admin`), `gh secret set VPS_SSH_PRIVATE_KEY` (clé dédiée au déploiement, générée pour l'occasion plutôt que de réutiliser une clé personnelle).
7. **Cron de sauvegarde** (`crontab -e` sur le VPS) :
   ```
   0 3 * * * /opt/golden-market/staging/deploy/backup-postgres.sh staging-golden-market-postgres medusa golden_market_staging /opt/backups/golden-market/staging 7 >> /var/log/golden-market-backup-staging.log 2>&1
   0 4 * * * /opt/golden-market/production/deploy/backup-postgres.sh production-golden-market-postgres medusa golden_market_production /opt/backups/golden-market/production 30 >> /var/log/golden-market-backup-production.log 2>&1
   ```
8. **Vérification finale** (reprend les critères de la spec) : HTTPS valide sur les deux domaines, `X-Forwarded-For` non contournable, push sur `staging`/`main` déclenche bien le déploiement automatique correspondant, un dump existe après 24h pour chaque environnement.

---

## Self-Review

- **Couverture de la spec** : branches/répertoires (Task 1), Dockerfiles + garde-fou build/runtime (Task 3-4), compose paramétré + isolation réseau/volumes/ports (Task 5), sauvegardes avec rétention différenciée (Task 6), vhosts Apache + écrasement `X-Forwarded-For` (Task 7), CI/CD (Task 8), TLS/certbot/secrets GitHub/premier déploiement (runbook manuel, délibérément hors subagent). Tous les points de la spec sont couverts.
- **Placeholders** : aucun `TBD`/`TODO` ; toutes les commandes de test sont concrètes et exécutables telles quelles.
- **Cohérence** : noms de conteneurs (`${ENV_NAME}-golden-market-*`) identiques entre `docker-compose.prod.yml` (Task 5), le script de sauvegarde (Task 6) et le cron du runbook ; ports (`9000`/`8000` prod, `9010`/`8010` staging) identiques entre `.env.deploy.example`, les vhosts Apache (Task 7) et le runbook.
- **Secrets réels** : le numéro Orange Money de test et toute autre valeur réelle communiquée par le propriétaire ne sont écrits nulle part dans ce plan ni dans aucun fichier suivi par git - uniquement dans les `.env`/`.env.deploy` du VPS au moment du runbook manuel.

---

## Choix d'exécution

Deux options pour les Tasks 1 à 8 (artefacts de dépôt, testables localement) :

1. **Subagent-Driven (recommandé)** - un subagent frais par tâche, revue entre chaque tâche, itération rapide. Cohérent avec l'approche déjà utilisée en Phase 2. À exécuter dans un worktree isolé (`superpowers:using-git-worktrees`), comme convenu pour cette phase à risque plus élevé.
2. **Exécution en ligne** - exécution en lot dans cette session via `executing-plans`, avec points de contrôle.

Le **Runbook manuel VPS** est explicitement exclu de ce choix : il est exécuté ensuite, en session interactive avec le propriétaire, jamais délégué à un subagent non supervisé.
