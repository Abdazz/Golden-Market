# Phase 3 - Déploiement VPS + Docker (staging puis production)

Spec validée par brainstorming le 2026-08-27. Complète `ROADMAP.md` (Phase 3) et
`ARCHITECTURE.md` en détaillant l'infrastructure de déploiement, avant écriture du
plan d'implémentation (`writing-plans`).

## Contexte et décisions de périmètre

Décision actée avec le propriétaire avant cette spec : le déploiement passe d'abord
par un environnement de **staging**, distinct de la production. La bascule
staging → production n'a lieu qu'après validation explicite du propriétaire - jamais
enchaînée automatiquement.

Contraintes d'infrastructure existantes (données par le propriétaire) :

- **VPS unique**, déjà utilisé pour héberger `n8n_automation` - pas de second VPS.
- **Domaine `golden-market.co`** déjà réservé, DNS déjà pointé vers ce VPS.
  Sous-domaine `staging.golden-market.co` pour l'environnement de staging.
- **Apache** déjà en place sur ce VPS comme reverse proxy (devant `n8n_automation`).
  Pas de second reverse proxy (Traefik/Caddy) à introduire.
- **Docker déjà installé** sur le VPS.
- Accès SSH avec **droits sudo complets**, via le compte `admin` existant (pas de
  compte `deploy` dédié - décision explicite du propriétaire malgré le risque
  signalé : la clé SSH de déploiement CI/CD portera les pleins droits sudo sur le
  VPS, y compris sur `n8n_automation`).

Points ouverts déjà identifiés dans `ROADMAP.md` avant cette spec, repris et
adressés ci-dessous :

- `medusa build` charge `medusa-config.ts`, donc le garde-fou `assertProductionConfig`
  (Phase 2) s'exécute aussi pendant le build de l'image Docker.
- Le reverse proxy doit écraser `X-Forwarded-For`, pas l'ajouter en liste, sinon le
  rate limiter par IP de la Phase 2 reste contournable.
- Le contenu "Livraison et retours" (texte de démo Medusa non vérifié) reste en
  l'état pour staging - traitement différé à la Phase 5.
- Orange Money / Resend restent en placeholder dans `apps/backend/.env` de
  production (le propriétaire les renseigne lui-même). Pour **staging**, le
  propriétaire fournira de vraies valeurs de test (Resend en mode sandbox/clé de
  test, numéro Orange Money de test) au moment du déploiement - jamais générées ou
  devinées par une session Claude.

## Architecture

### Branches et disposition sur le VPS

- Branche `staging` créée (locale + distante sur `origin`), branche d'intégration
  permanente : tout travail futur (features, correctifs) y est poussé/mergé en
  premier. `main` reste le miroir exact de ce qui tourne en production - jamais de
  commit direct dessus, uniquement des merges depuis `staging`, décidés et exécutés
  par le propriétaire (jamais par une session Claude sans son accord explicite au
  moment précis de la bascule).
- Sur le VPS, deux checkouts indépendants du dépôt dans des répertoires séparés :
  `/opt/golden-market/staging` et `/opt/golden-market/production`. Chacun avec son
  propre `.env` (jamais commité), sa propre invocation Docker Compose et ses propres
  volumes de données. Aucun état partagé entre les deux.
- `staging.golden-market.co` → stack du répertoire staging ;
  `golden-market.co` → stack du répertoire production.

### Docker Compose (fichier unique, paramétré par `.env`)

- Un **unique `docker-compose.yml`** à la racine du dépôt, commun aux deux
  environnements (pas de `docker-compose.staging.yml` / `docker-compose.production.yml`
  séparés).
- Chaque service nomme son conteneur via une variable d'environnement de préfixe,
  ex. `container_name: ${ENV_NAME}-backend`, `${ENV_NAME}-postgres`,
  `${ENV_NAME}-redis`, `${ENV_NAME}-storefront`, où `ENV_NAME` (`staging` ou
  `production`) vient du `.env` propre à chaque répertoire de déploiement. Ce
  préfixe sert la lisibilité (`docker ps`), pas l'isolation.
- L'isolation réelle (réseau Docker, volumes) vient du nom de projet Compose, dérivé
  du répertoire de déploiement (chaque environnement invoque `docker compose` depuis
  son propre répertoire) - donc automatiquement distincte entre staging et
  production même si le fichier compose est identique.
- Services par stack : `backend` (Medusa), `storefront` (Next.js), `postgres`,
  `redis` - un jeu dédié et isolé par environnement (pas d'instance Postgres/Redis
  partagée entre staging et production).
- `postgres` et `redis` ne publient **aucun port sur l'hôte** - accessibles
  uniquement via le réseau Docker interne du projet compose. Seuls `backend` et
  `storefront` publient un port, et uniquement sur `127.0.0.1` (jamais exposés
  directement à internet - Apache reçoit seul le trafic public).
- Les ports publiés côté hôte viennent eux aussi du `.env` de chaque environnement
  (`BACKEND_PORT`, `STOREFRONT_PORT`), pour éviter toute collision si les deux
  stacks tournent simultanément sur le même hôte avec le même fichier compose.
  Valeurs proposées (à ne pas confondre avec le stack de dev local `:8002`/`:9002`) :
  production `backend:9000` / `storefront:8000`, staging `backend:9010` /
  `storefront:8010`.

### Secrets de build vs secrets de runtime (`assertProductionConfig`)

Le Dockerfile du backend construit l'image **sans** `NODE_ENV=production` (le build
`medusa build` tourne donc avec le garde-fou `assertProductionConfig` en no-op).
`NODE_ENV=production` n'est injecté qu'au démarrage du conteneur, via le `.env` de
l'environnement concerné, avec les vrais secrets (`JWT_SECRET`, `COOKIE_SECRET`,
CORS) valides à ce moment-là. Mécanisme identique pour staging et production ; seules
les valeurs des secrets diffèrent (staging peut utiliser des secrets forts mais
propres à cet environnement, jamais réutilisés en production).

### Reverse proxy (Apache existant) et TLS

- Apache reste l'unique point d'entrée sur les ports 80/443 du VPS - aucun second
  reverse proxy introduit.
- Deux nouveaux `VirtualHost` Apache :
  - `golden-market.co` → `ProxyPass`/`ProxyPassReverse` vers `127.0.0.1:8000` et
    `127.0.0.1:9000` (routes storefront et API backend respectivement, découpage
    exact des chemins à définir en plan d'implémentation).
  - `staging.golden-market.co` → mêmes règles vers `127.0.0.1:8010` /
    `127.0.0.1:9010`.
- Certificats TLS via `certbot` (plugin Apache, `certbot --apache`), un certificat
  par sous-domaine.
- **Chaque VirtualHost doit écraser `X-Forwarded-For`**
  (`RequestHeader set X-Forwarded-For %{REMOTE_ADDR}s`), jamais l'ajouter en liste -
  condition nécessaire pour que le rate limiter par IP de la Phase 2
  (`POST /auth/customer/emailpass/reset-password`) ne soit pas contournable par un
  client usurpant cet en-tête.

### CI/CD (GitHub Actions)

- Déploiement automatisé dès cette phase (pas de script manuel intermédiaire).
- Authentification SSH vers le VPS avec le compte `admin` existant (droits sudo
  complets - décision explicite du propriétaire, voir Contexte ci-dessus). Clé SSH
  de déploiement stockée en secret GitHub Actions.
- Deux workflows déclenchés sur push :
  - push sur `staging` → SSH vers le VPS, `git pull` dans
    `/opt/golden-market/staging`, `docker compose build && docker compose up -d`,
    puis migrations (`medusa db:migrate`) exécutées dans le conteneur `backend`.
  - push sur `main` → même séquence dans `/opt/golden-market/production`.
- Le garde-fou humain reste le merge `staging` → `main`, décidé et exécuté par le
  propriétaire - la CI ne fait qu'exécuter ce que ce merge déclenche, elle ne décide
  jamais elle-même de promouvoir staging vers la production.

### Sauvegardes Postgres

- Production : `pg_dump` du conteneur `production-postgres` quotidien via cron sur
  le VPS, rétention **30 jours**.
- Staging : `pg_dump` quotidien également, rétention **7 jours** (une semaine) -
  données jetables par nature mais utile pour ne pas perdre une configuration de
  test entre deux sessions.

### Hors périmètre de cette phase (rappel, déjà noté ailleurs)

- Compte admin Medusa dédié en production : créé manuellement après le premier
  déploiement, pas via script automatisé (déjà acquis sans code depuis la Phase 2).
- Contenu "Livraison et retours" (texte de démo non vérifié) : laissé tel quel,
  traité en Phase 5.
- CI de tests/lint sur pull request (Phase 4) : distincte du déploiement décrit
  ici, non couverte par cette spec.

## Critères de vérification (repris en plan d'implémentation)

- Build Docker du backend réussit sans `NODE_ENV=production` ; le conteneur démarré
  avec `NODE_ENV=production` et des secrets invalides fait échouer le démarrage
  (`assertProductionConfig` toujours actif au runtime).
- `staging.golden-market.co` et `golden-market.co` répondent en HTTPS (certificat
  valide), chacun routé vers sa propre stack Docker isolée (conteneurs, réseau,
  volumes distincts - vérifiable via `docker ps`/`docker network ls` avec le préfixe
  `ENV_NAME`).
- Une requête vers `POST /auth/customer/emailpass/reset-password` avec un
  `X-Forwarded-For` falsifié dans la requête cliente n'échappe pas au rate limiting
  par IP (l'en-tête reçu par le backend reflète l'IP réelle du client, pas la valeur
  usurpée).
- Push sur `staging` déclenche un déploiement automatique visible sur
  `staging.golden-market.co` ; push/merge sur `main` déclenche le déploiement
  équivalent sur `golden-market.co`, sans qu'aucune session Claude n'ait exécuté ce
  merge elle-même.
- Un dump Postgres existe après 24h pour chaque environnement, avec la politique de
  rétention correspondante appliquée (7 jours staging, 30 jours production).
