#!/usr/bin/env bash
# Manual PostgreSQL backup for ClientShield (Phase 6P1).
# Does NOT schedule or automate backups — run by an operator.
#
# Usage:
#   ./scripts/backup-postgres.sh
#   COMPOSE_FILE=compose.production.yaml ./scripts/backup-postgres.sh
#   DATABASE_URL=postgresql://... ./scripts/backup-postgres.sh
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-compose.production.yaml}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="${BACKUP_DIR}/clientshield_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "==> Backup target: $OUT_FILE"

if [[ -n "${DATABASE_URL:-}" ]]; then
  # Host-side pg_dump (requires postgresql-client)
  if ! command -v pg_dump >/dev/null 2>&1; then
    echo "ERROR: pg_dump not found. Install postgresql-client or use compose mode." >&2
    exit 1
  fi
  pg_dump --no-owner --format=plain "$DATABASE_URL" | gzip -c >"$OUT_FILE"
elif docker compose -f "$ROOT_DIR/$COMPOSE_FILE" ps --status running --services 2>/dev/null | grep -qx postgres; then
  # Dump from the production compose postgres service
  POSTGRES_USER="${POSTGRES_USER:-clientshield}"
  POSTGRES_DB="${POSTGRES_DB:-clientshield}"
  docker compose -f "$ROOT_DIR/$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --format=plain \
    | gzip -c >"$OUT_FILE"
elif docker compose -f "$ROOT_DIR/compose.yaml" ps --status running --services 2>/dev/null | grep -qx postgres; then
  docker compose -f "$ROOT_DIR/compose.yaml" exec -T postgres \
    pg_dump -U clientshield_dev -d clientshield --no-owner --format=plain \
    | gzip -c >"$OUT_FILE"
else
  echo "ERROR: No DATABASE_URL and no running postgres compose service found." >&2
  exit 1
fi

BYTES="$(wc -c <"$OUT_FILE" | tr -d ' ')"
echo "==> Wrote $OUT_FILE ($BYTES bytes)"
echo "==> Volume note: production Postgres data lives in Docker volume clientshield_prod_pgdata"
echo "    Inspect: docker volume inspect clientshield_prod_pgdata"
