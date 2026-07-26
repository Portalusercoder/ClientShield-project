# ClientShield Deployment Guide

Production deployment foundation (Phase **6P1**). For operational hardening, secrets rotation, and runbooks see [PRODUCTION.md](./PRODUCTION.md).

## Architecture (Docker)

```
Internet → nginx (:80/:443) → app (:3001, Next.js standalone)
                              ↘ postgres (internal only)
         wazuh-worker ────────→ postgres
         sla-worker ──────────→ postgres
```

| Service | Image / role | Notes |
|---------|----------------|-------|
| `nginx` | `nginx:1.27-alpine` | Reverse proxy, compression, forwarded headers, WebSockets |
| `app` | `clientshield` (`CMD app`) | Next.js standalone, migrations on start, non-root `nextjs` |
| `wazuh-worker` | same image (`CMD wazuh-worker`) | Background Wazuh sync |
| `sla-worker` | same image (`CMD sla-worker`) | SLA escalation loop |
| `postgres` | `postgres:16-alpine` | Volume `clientshield_prod_pgdata` |

Redis is **not** required and is not included.

## Prerequisites (Ubuntu 22.04 / 24.04)

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
# Docker Engine + Compose plugin (official docs):
# https://docs.docker.com/engine/install/ubuntu/
docker --version
docker compose version
```

Node.js on the host is optional when running fully via Compose. For host-side builds/tests use Node 20+.

## Development vs production Compose

| File | Purpose |
|------|---------|
| `compose.yaml` | **Development** — Postgres + ZAP only; run `npm run dev` on the host |
| `compose.production.yaml` | **Production** — Postgres, app, workers, nginx |

```bash
# Dev data plane
docker compose up -d

# Production stack
cp .env.example .env.production   # then edit secrets
docker compose -f compose.production.yaml --env-file .env.production config
docker compose -f compose.production.yaml --env-file .env.production up -d --build
```

## Environment

Copy `.env.example` → `.env.production` and set at minimum:

| Variable | Required in production |
|----------|------------------------|
| `DATABASE_URL` | Yes (points at compose service `postgres`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Yes (compose postgres) |
| `AUTH_SECRET` | Yes |
| `AUTH_PROVIDER=auth0` | Yes |
| `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` / `AUTH0_ISSUER` | Yes |
| `NEXT_PUBLIC_APP_URL` | Yes (public URL behind nginx) |
| `AUTH_DEV_BYPASS` | Must be `false` or unset |
| `BUILD_VERSION` / `GIT_SHA` | Recommended (shown on `/api/health`) |

Example `DATABASE_URL` on the Compose network:

```
DATABASE_URL=postgresql://USER:PASSWORD@postgres:5432/clientshield?schema=public
```

Secrets are injected via `env_file` — **never** baked into the image.

## Startup sequence

Container entrypoint (`scripts/docker-entrypoint.sh`) and Next.js `instrumentation.ts`:

1. **Configuration** — refuse missing `DATABASE_URL`; in production refuse `AUTH_DEV_BYPASS`, require Auth0 + `AUTH_SECRET`
2. **Database** — wait until Prisma `SELECT 1` succeeds
3. **Migrations** — `prisma migrate deploy` (**app** role only)
4. **Application ready** — `node server.js` (or worker process)

Partial starts are refused: migrate failure or validation failure exits non-zero.

## Health endpoint

`GET /api/health` (public; no auth; no secrets)

Reports: overall status, build version, git SHA, environment, uptime, application, database latency, Prisma, Wazuh/SLA worker heartbeats.

- `200` — `ok` or `degraded`
- `503` — `error` (e.g. database down)

```bash
curl -sS http://127.0.0.1/api/health | jq .
```

## Nginx

- Config: `nginx/nginx.conf` + `nginx/conf.d/clientshield.conf` (read-only mounts)
- Features: forwarded headers, WebSocket upgrade, `client_max_body_size 50m`, gzip, basic security headers (no HSTS/CSP in this phase)
- TLS: mount certs into `nginx/certs/` (`fullchain.pem`, `privkey.pem`), then enable `nginx/conf.d/ssl.conf.example` → `ssl.conf`

Certificates are **not** included in the repository.

## Workers

```bash
# Same image, different command
docker compose -f compose.production.yaml logs -f wazuh-worker
docker compose -f compose.production.yaml logs -f sla-worker
```

Enable via env: `WAZUH_ENABLED` + `WAZUH_AUTO_SYNC_ENABLED`, `SLA_ESCALATION_ENABLED`.

## Backups (manual)

```bash
chmod +x scripts/backup-postgres.sh scripts/restore-postgres.sh
./scripts/backup-postgres.sh
# Restore (destructive — prompts for RESTORE)
./scripts/restore-postgres.sh backups/postgres/clientshield_….sql.gz
```

| Volume | Purpose |
|--------|---------|
| `clientshield_prod_pgdata` | PostgreSQL data |
| `clientshield_prod_reports` | Generated reports under `/app/storage/reports` |

Automation of backups is **out of scope** for 6P1.

## Upgrade procedure

1. Backup Postgres (`./scripts/backup-postgres.sh`)
2. Set `BUILD_VERSION` / `GIT_SHA` for the new release
3. `git fetch && git checkout <tag-or-commit>`
4. `docker compose -f compose.production.yaml --env-file .env.production build app`
5. `docker compose -f compose.production.yaml --env-file .env.production up -d`
6. Confirm `GET /api/health` → `status: ok` (or expected `degraded` if workers intentionally off)
7. Smoke-check login, a Server Action, and worker logs

Migrations run automatically on **app** start (`migrate deploy`).

## Rollback procedure

1. Stop stack: `docker compose -f compose.production.yaml down` (keeps volumes)
2. Check out the previous known-good commit/tag
3. Rebuild/redeploy that image tag
4. If a migration is incompatible with rollback, restore the matching Postgres backup **before** starting app
5. Verify `/api/health` and authentication

Forward-only migrations: prefer restore-from-backup over reverse migrations unless a down migration exists.

## Validation commands

```bash
npm run typecheck
npm run lint
npm run build
docker build -t clientshield:local .
docker compose -f compose.production.yaml config
npm run test:startup-env
npm run test:health
```
