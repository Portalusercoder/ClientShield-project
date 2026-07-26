# ClientShield Production Notes

Companion to [DEPLOYMENT.md](./DEPLOYMENT.md). Phase **6P1** scope: deployment foundation only (no metrics, tracing, Sentry, rate limiting, CSP, or HSTS).

## Secure defaults

- Containers run as non-root (`nextjs` uid 1001 in the app image; nginx/postgres use distro defaults with `no-new-privileges`)
- Secrets via environment / `env_file` — never `COPY` `.env` into the image (see `.dockerignore`)
- Postgres is **not** published to the host in production compose
- App listens on the internal network only; nginx is the ingress
- Nginx config and TLS material mounted **read-only**
- Production refuses `AUTH_DEV_BYPASS=true`
- Startup fails closed if Auth0 / `AUTH_SECRET` / `DATABASE_URL` / DB connectivity / migrations fail

## Environment validation

| Layer | What it checks |
|-------|----------------|
| Zod `lib/env.ts` | Schema parse for known server vars (fails on invalid types) |
| `scripts/docker-entrypoint.sh` | Required production Auth0 + `DATABASE_URL`; DB wait; migrate deploy |
| `lib/startup/bootstrap.ts` + `instrumentation.ts` | Auth fail-closed, `NEXT_PUBLIC_APP_URL`, DB `SELECT 1` before serving |

Helpful errors are logged as JSON lines with `service: entrypoint|startup|instrumentation`.

## Health semantics

| Overall `status` | HTTP | Meaning |
|------------------|------|---------|
| `ok` | 200 | App up; DB/Prisma OK; enabled workers heartbeating (or workers disabled) |
| `degraded` | 200 | DB OK but an **enabled** worker heartbeat is stale/unknown |
| `error` | 503 | Database / Prisma unreachable |

Worker heartbeats older than **5 minutes** are `stale`. Disabled integrations report `disabled` and do not degrade the overall status.

## Docker image

Multi-stage `Dockerfile`:

1. **deps** — `npm ci`
2. **builder** — `prisma generate`, `next build` (standalone), prune + `tsx`/`prisma` for runtime
3. **runner** — non-root, standalone server + workers source, `HEALTHCHECK` → `/api/health`

Roles via entrypoint args: `app` | `wazuh-worker` | `sla-worker`.

## Compose production checklist

- [ ] `.env.production` filled (no defaults for passwords)
- [ ] `NEXT_PUBLIC_APP_URL` matches the public hostname
- [ ] Auth0 application callback URLs include `https://YOUR_HOST/api/auth/callback/auth0`
- [ ] TLS certs mounted and `ssl.conf` enabled (when terminating TLS at nginx)
- [ ] First backup taken after go-live
- [ ] `/api/health` monitored by your load balancer / uptime check

## Security hardening (Phase 6P3)

See [SECURITY.md](./SECURITY.md). Defaults: CSP on, HSTS on in production, rate limiting on, Auth.js secure cookies in production.

- Automated backups
- Centralized logging / metrics / tracing / Sentry
- Rate limiting, CSP, HSTS
- Redis
- Blue/green or automated rollback orchestration

## Incident tips

- App crash-looping: `docker compose -f compose.production.yaml logs app` — look for Auth0 / migrate errors
- `503` on health: Postgres volume or `DATABASE_URL` host (`postgres` service name)
- `degraded`: start or fix workers, or disable unused flags (`WAZUH_AUTO_SYNC_ENABLED`, `SLA_ESCALATION_ENABLED`)
- Nginx 502: app not healthy yet — wait for migrate + start-period
