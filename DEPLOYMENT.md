# Déploiement production — VPS + Docker

Procédure de déploiement de Golden Market sur un VPS auto-hébergé, à côté de
l'infra `n8n` existante (voir `ARCHITECTURE.md`). Complète
`ROADMAP.md` (Phase 3) — ce document décrit le *comment*, `ROADMAP.md` garde
la case à cocher.

**Non vérifié en conditions réelles** : les Dockerfiles et `docker-compose.prod.yml`
ci-dessous ont été écrits et relus attentivement (notamment le comportement
réel de `medusa build`/`medusa start`, vérifié en lisant le code source de
`@medusajs/framework` et `@medusajs/medusa` plutôt que supposé), mais n'ont
pas pu être testés par un vrai `docker build` dans l'environnement où ce
travail a été fait : la politique réseau du sandbox bloque l'accès à
`production.cloudfront.docker.com` (le registre Docker Hub), donc impossible
d'y tirer `node:20-alpine`. **À valider par un vrai build avant le premier
déploiement réel** (Phase 5).

## Prérequis

- Un VPS avec Docker + Docker Compose v2 installés.
- Deux sous-domaines DNS (A/AAAA) pointant vers l'IP du VPS, ex.
  `boutique.golden-market.co` (storefront) et `api.golden-market.co` (backend +
  admin Medusa, servis sur le même port par `medusa start`).
- **Vérifier qu'aucun autre service n'occupe déjà les ports 80/443 du VPS**
  avant le premier déploiement — si `n8n` tourne sur le même VPS
  avec son propre reverse proxy (Nginx, Traefik, ou n8n lui-même), il y aura
  collision avec le service `reverse-proxy` (Caddy) de ce dépôt. Deux options
  si c'est le cas : donner un VPS/IP dédié à Golden Market, ou remplacer le
  service Caddy par une intégration au reverse proxy existant (non fait ici,
  pas d'accès au dépôt `n8n` pour ce travail).

## Premier déploiement

```bash
git clone <repo> golden-market && cd golden-market

cp deploy/.env.example deploy/.env
# Remplir deploy/.env : domaines, POSTGRES_PASSWORD, JWT_SECRET/COOKIE_SECRET
# (openssl rand -base64 32 pour chacun), ORANGE_MONEY_*, N8N_ORDER_WEBHOOK_URL,
# RESEND_API_KEY, NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY (voir plus bas comment
# l'obtenir), ACME_EMAIL.

docker compose --env-file deploy/.env -f docker-compose.prod.yml up -d --build
```

Le conteneur `backend` applique les migrations en attente à chaque démarrage
avant de lancer le serveur (`apps/backend/docker-entrypoint.sh` — sûr en
déploiement mono-instance, voir le commentaire dans ce fichier).

### Créer le compte admin de production

```bash
docker compose -f docker-compose.prod.yml exec backend npx medusa user \
  -e admin@golden-market.co -p '<mot de passe fort, distinct de celui utilisé en dev>'
```

Ne jamais réutiliser les identifiants de dev mentionnés dans `ARCHITECTURE.md`.

### Obtenir la clé publishable et la lier au bon sales channel

Après le premier démarrage, dans l'admin (`https://<BACKEND_DOMAIN>/app`) :
créer/vérifier la clé publishable et la lier au *Default Sales Channel* — piège
déjà documenté dans `ARCHITECTURE.md` (sinon `GET /store/products` renvoie 0
produit). Reporter la valeur dans `deploy/.env`
(`NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`) puis reconstruire le storefront :

```bash
docker compose --env-file deploy/.env -f docker-compose.prod.yml up -d --build storefront
```

(Nécessaire car cette variable est injectée au moment du build du storefront,
pas seulement au runtime — voir le commentaire dans `apps/storefront/Dockerfile`.)

### Importer le catalogue et seed la région BF

Comme en dev (voir `AGENTS.md`), mais dans le conteneur :

```bash
docker compose -f docker-compose.prod.yml exec backend npx medusa exec ./src/scripts/seed-region-bf.ts
docker compose -f docker-compose.prod.yml exec backend npx medusa exec ./src/scripts/import-catalog.ts
```

Le fichier Excel source doit être présent dans l'image (il est committé sous
`apps/backend/src/scripts/catalog-import/`, donc inclus par `COPY apps/backend`
dans le Dockerfile).

## Déploiements suivants

```bash
git pull
docker compose --env-file deploy/.env -f docker-compose.prod.yml up -d --build
```

## Sauvegardes Postgres

`deploy/backup-postgres.sh` : dump quotidien compressé + purge au-delà de 14
jours (configurable via `RETENTION_DAYS`). À programmer en cron sur le VPS
(pas dans un conteneur) :

```cron
0 3 * * * /opt/golden-market/deploy/backup-postgres.sh >> /var/log/golden-market-backup.log 2>&1
```

Restauration (à partir d'un dump) :

```bash
gunzip -c /opt/golden-market/backups/medusa-backend_<timestamp>.sql.gz | \
  docker compose --env-file deploy/.env -f docker-compose.prod.yml exec -T postgres \
  psql -U medusa medusa-backend
```

## TLS

Automatique via Caddy (`deploy/Caddyfile`) — obtient et renouvelle les
certificats Let's Encrypt pour `BACKEND_DOMAIN` et `STOREFRONT_DOMAIN` sans
configuration supplémentaire, tant que ces domaines pointent bien vers ce VPS
et que les ports 80/443 sont libres (voir Prérequis).

## Sécurité (rappel Phase 2)

Les points de `ROADMAP.md` Phase 2 qui ne pouvaient pas être faits sans
serveur réel se referment ici : `deploy/.env` porte les vrais secrets
(distincts des valeurs de dev) et les vrais domaines (CORS du backend
construits depuis `BACKEND_DOMAIN`/`STOREFRONT_DOMAIN` dans
`docker-compose.prod.yml`, plus de `localhost` ni `docs.medusajs.com`).
