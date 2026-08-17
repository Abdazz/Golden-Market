# Image de production pour apps/backend (Medusa).
# Contexte de build attendu : la racine du monorepo (voir docker-compose.prod.yml,
# `build.context: .`) — nécessaire pour résoudre les workspaces npm.

# --- Étage 1 : build (compile le backend, génère apps/backend/.medusa/server) ---
FROM node:20-alpine AS build
WORKDIR /app

# Copié séparément du reste pour profiter du cache Docker : cet étage n'est
# invalidé que si un package.json ou le lockfile changent.
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/storefront/package.json apps/storefront/package.json
RUN npm ci

COPY apps/backend apps/backend
RUN npm run build --workspace=@dtc/backend

# --- Étage 2 : dépendances de production isolées ---
# `medusa build` copie apps/backend/package.json tel quel dans .medusa/server ;
# on y installe un node_modules propre (sans les outils de dev du monorepo racine).
FROM node:20-alpine AS deps
WORKDIR /app
COPY --from=build /app/apps/backend/.medusa/server ./
RUN npm install

# --- Étage 3 : image finale ---
FROM node:20-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app ./
COPY apps/backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 9000
ENTRYPOINT ["docker-entrypoint.sh"]
