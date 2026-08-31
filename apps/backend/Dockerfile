# Construit sans NODE_ENV=production : `medusa build` charge medusa-config.ts,
# qui appelle assertProductionConfig (garde-fou Phase 2) - il ne doit pas se
# déclencher pendant le build. NODE_ENV=production n'est injecté qu'au runtime,
# via docker-compose.prod.yml, avec les vrais secrets de l'environnement ciblé.
FROM node:20-alpine AS builder
WORKDIR /app

# Manifestes d'abord : la couche `npm ci` n'est ré-exécutée que si les
# dépendances changent réellement, pas à chaque modification de code source.
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/storefront/package.json apps/storefront/package.json
RUN npm ci

COPY . .
WORKDIR /app/apps/backend
RUN npm run build
WORKDIR /app/apps/backend/.medusa/server
RUN npm install --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/backend/.medusa/server ./
EXPOSE 9000
CMD ["npm", "run", "start"]
