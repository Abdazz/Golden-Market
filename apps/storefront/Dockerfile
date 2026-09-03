# Next.js grave les variables NEXT_PUBLIC_* dans le bundle client au moment du
# build (pas au runtime) : elles doivent donc être passées en --build-arg, avec
# des valeurs différentes pour staging et production (backend et clé publishable
# distincts par environnement - voir docker-compose.prod.yml).
FROM node:20-alpine
WORKDIR /app

# Manifestes d'abord : la couche `npm ci` n'est ré-exécutée que si les
# dépendances changent réellement (package-lock.json ou un package.json de
# workspace), pas à chaque modification de code source. Sur ce VPS partagé le
# cache de couches BuildKit ne survit pas toujours entre deux déploiements,
# mais quand il survit c'est cette couche (la plus longue) qui est réutilisée.
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/storefront/package.json apps/storefront/package.json
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_DEFAULT_REGION
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_MATOMO_URL
ARG NEXT_PUBLIC_MATOMO_SITE_ID
ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=${NEXT_PUBLIC_MEDUSA_BACKEND_URL} \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY} \
    NEXT_PUBLIC_DEFAULT_REGION=${NEXT_PUBLIC_DEFAULT_REGION} \
    NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL} \
    NEXT_PUBLIC_MATOMO_URL=${NEXT_PUBLIC_MATOMO_URL} \
    NEXT_PUBLIC_MATOMO_SITE_ID=${NEXT_PUBLIC_MATOMO_SITE_ID}
WORKDIR /app/apps/storefront
RUN npm run build
EXPOSE 8000
CMD ["npm", "run", "start"]
