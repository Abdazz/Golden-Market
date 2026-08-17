#!/bin/sh
# Sauvegarde quotidienne de la base Postgres de production (pg_dump + gzip).
# À lancer depuis le VPS via cron (pas depuis un conteneur jetable) :
#
#   0 3 * * * /opt/golden-market/deploy/backup-postgres.sh >> /var/log/golden-market-backup.log 2>&1
#
# Voir DEPLOYMENT.md pour la procédure de restauration.
set -eu

cd "$(dirname "$0")/.."  # racine du dépôt (contient docker-compose.prod.yml)

# shellcheck disable=SC1091
set -a
. ./deploy/.env
set +a

BACKUP_DIR="${BACKUP_DIR:-/opt/golden-market/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

timestamp=$(date +%Y-%m-%d_%H%M%S)
dump_file="$BACKUP_DIR/medusa-backend_$timestamp.sql.gz"

docker compose --env-file deploy/.env -f docker-compose.prod.yml exec -T \
  -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$dump_file"

echo "Sauvegarde écrite dans $dump_file"

find "$BACKUP_DIR" -name "medusa-backend_*.sql.gz" -mtime "+$RETENTION_DAYS" -delete
