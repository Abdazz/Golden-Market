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
