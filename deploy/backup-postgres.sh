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
