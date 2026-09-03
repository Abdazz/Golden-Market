#!/usr/bin/env bash
set -euo pipefail

# Sauvegarde du conteneur MariaDB de Matomo (production uniquement, voir
# docker-compose.prod.yml - profil "analytics") et purge des dumps plus
# vieux que RETENTION_DAYS. Miroir de backup-postgres.sh, adapté à
# mysqldump.
# Usage : backup-matomo.sh <container_name> <mysql_user> <mysql_password> <mysql_db> <backup_dir> <retention_days>

if [ "$#" -ne 6 ]; then
  echo "Usage: $0 <container_name> <mysql_user> <mysql_password> <mysql_db> <backup_dir> <retention_days>" >&2
  exit 1
fi

CONTAINER_NAME="$1"
MYSQL_USER="$2"
MYSQL_PASSWORD="$3"
MYSQL_DB="$4"
BACKUP_DIR="$5"
RETENTION_DAYS="$6"

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y-%m-%dT%H-%M-%S)"
DUMP_FILE="${BACKUP_DIR}/${MYSQL_DB}-${TIMESTAMP}.sql.gz"

docker exec "$CONTAINER_NAME" mysqldump -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DB" | gzip > "$DUMP_FILE"

find "$BACKUP_DIR" -name "${MYSQL_DB}-*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
