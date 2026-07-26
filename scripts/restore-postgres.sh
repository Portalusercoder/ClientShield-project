#!/usr/bin/env bash
# Manual PostgreSQL restore for ClientShield (Phase 6P1).
# DESTRUCTIVE — restores into the target database. Confirm before running.
#
# Usage:
#   ./scripts/restore-postgres.sh backups/postgres/clientshield_YYYYMMDDThhmmssZ.sql.gz
#   COMPOSE_FILE=compose.production.yaml ./scripts/restore-postgres.sh path/to/backup.sql.gz
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-compose.production.yaml}"
BACKUP_FILE="${1:-}"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: $0 <backup.sql.gz>" >&2
  exit 1
fi
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

echo "WARNING: This will overwrite data in the target database."
echo "Backup: $BACKUP_FILE"
read -r -p "Type RESTORE to continue: " CONFIRM
if [[ "$CONFIRM" != "RESTORE" ]]; then
  echo "Aborted."
  exit 1
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  if ! command -v psql >/dev/null 2>&1; then
    echo "ERROR: psql not found. Install postgresql-client or use compose mode." >&2
    exit 1
  fi
  gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
elif docker compose -f "$ROOT_DIR/$COMPOSE_FILE" ps --status running --services 2>/dev/null | grep -qx postgres; then
  POSTGRES_USER="${POSTGRES_USER:-clientshield}"
  POSTGRES_DB="${POSTGRES_DB:-clientshield}"
  gunzip -c "$BACKUP_FILE" | docker compose -f "$ROOT_DIR/$COMPOSE_FILE" exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
elif docker compose -f "$ROOT_DIR/compose.yaml" ps --status running --services 2>/dev/null | grep -qx postgres; then
  gunzip -c "$BACKUP_FILE" | docker compose -f "$ROOT_DIR/compose.yaml" exec -T postgres \
    psql -U clientshield_dev -d clientshield
else
  echo "ERROR: No DATABASE_URL and no running postgres compose service found." >&2
  exit 1
fi

echo "==> Restore complete. Restart app/workers and verify GET /api/health."
