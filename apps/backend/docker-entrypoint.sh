#!/bin/sh
# Déploiement mono-instance (un seul conteneur backend) : appliquer les
# migrations à chaque démarrage est donc sûr (medusa db:migrate est idempotent,
# n'applique que les migrations en attente) et évite d'oublier cette étape
# après un déploiement. Ne pas répliquer ce conteneur sans revoir ce point
# (risque de migrations concurrentes).
set -e

echo "Application des migrations en attente..."
npx medusa db:migrate

echo "Démarrage de Medusa..."
exec npm run start
