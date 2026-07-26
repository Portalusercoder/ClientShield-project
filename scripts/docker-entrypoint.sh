#!/bin/sh
# ClientShield container entrypoint (Phase 6P1).
# Sequence: env → database wait → migrations → command.
set -eu

ROLE="${1:-app}"

log() {
  # shellcheck disable=SC3037
  printf '%s\n' "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"service\":\"entrypoint\",\"message\":\"$*\"}"
}

fail() {
  log "FATAL: $*"
  exit 1
}

# --- Configuration ---
if [ -z "${DATABASE_URL:-}" ]; then
  fail "DATABASE_URL is required"
fi

if [ "${NODE_ENV:-}" = "production" ]; then
  if [ "${AUTH_DEV_BYPASS:-}" = "true" ]; then
    fail "AUTH_DEV_BYPASS=true is refused when NODE_ENV=production"
  fi
  if [ -z "${AUTH_SECRET:-}" ]; then
    fail "AUTH_SECRET is required in production"
  fi
  if [ -z "${AUTH0_CLIENT_ID:-}" ] || [ -z "${AUTH0_CLIENT_SECRET:-}" ] || [ -z "${AUTH0_ISSUER:-}" ]; then
    fail "AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, and AUTH0_ISSUER are required in production"
  fi
  if [ -z "${AUTH_PROVIDER:-}" ] || [ "${AUTH_PROVIDER}" = "none" ]; then
    fail "AUTH_PROVIDER must be auth0 (or compatible) in production — got '${AUTH_PROVIDER:-empty}'"
  fi
  if [ -z "${NEXT_PUBLIC_APP_URL:-}" ]; then
    fail "NEXT_PUBLIC_APP_URL is required in production (public base URL behind nginx)"
  fi
fi

# --- Database readiness ---
log "Waiting for database connectivity"
ATTEMPT=0
MAX_ATTEMPTS="${DB_WAIT_ATTEMPTS:-60}"
until node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$queryRaw\`SELECT 1\`
  .then(() => p.\$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => { try { await p.\$disconnect(); } catch {} process.exit(1); });
" 2>/dev/null; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
    fail "Database not reachable after ${MAX_ATTEMPTS} attempts"
  fi
  sleep 2
done
log "Database is reachable"

# --- Migrations (app role only; workers assume migrated schema) ---
if [ "$ROLE" = "app" ]; then
  log "Applying Prisma migrations (migrate deploy)"
  if ! npx prisma migrate deploy; then
    fail "prisma migrate deploy failed — refusing to start"
  fi
  log "Migrations applied"
fi

case "$ROLE" in
  app)
    log "Starting ClientShield application (Next.js standalone)"
    exec node server.js
    ;;
  wazuh-worker)
    log "Starting Wazuh sync worker"
    exec npx tsx workers/wazuh-sync-worker.ts
    ;;
  sla-worker)
    log "Starting SLA escalation worker"
    exec npx tsx workers/sla-escalation-worker.ts
    ;;
  *)
    fail "Unknown role '$ROLE' (expected: app | wazuh-worker | sla-worker)"
    ;;
esac
