# Image de production pour apps/storefront (Next.js, sortie "standalone").
# Contexte de build attendu : la racine du monorepo (voir docker-compose.prod.yml,
# `build.context: .`) — nécessaire pour résoudre les workspaces npm.

# --- Étage 1 : build ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/storefront/package.json apps/storefront/package.json
RUN npm ci

COPY apps/storefront apps/storefront

# Variables NEXT_PUBLIC_* : intégrées au bundle client au moment du build, pas
# au démarrage du conteneur — doivent donc être fournies en `build.args` dans
# docker-compose.prod.yml, pas seulement en `environment:`.
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_DEFAULT_REGION
ARG NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=$NEXT_PUBLIC_MEDUSA_BACKEND_URL \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY \
    NEXT_PUBLIC_DEFAULT_REGION=$NEXT_PUBLIC_DEFAULT_REGION \
    NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL

RUN npm run build --workspace=@dtc/storefront

# --- Étage 2 : image finale ---
# La sortie "standalone" de Next.js retrace les dépendances depuis la racine du
# monorepo et reproduit l'arborescence apps/storefront/ à l'intérieur — d'où les
# chemins imbriqués ci-dessous (pas une erreur de copie).
FROM node:20-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/apps/storefront/.next/standalone ./
COPY --from=build /app/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=build /app/apps/storefront/public ./apps/storefront/public

# Revalidées au démarrage par check-env-variables.js (via next.config.js) :
# doivent aussi être présentes en `environment:` au runtime, pas seulement en
# build.args ci-dessus.
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_DEFAULT_REGION
ARG NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=$NEXT_PUBLIC_MEDUSA_BACKEND_URL \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY \
    NEXT_PUBLIC_DEFAULT_REGION=$NEXT_PUBLIC_DEFAULT_REGION \
    NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL

EXPOSE 8000
CMD ["node", "apps/storefront/server.js"]
