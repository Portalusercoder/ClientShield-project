# Security Hardening (Phase 6P3)

Defensive controls for production. No Sentry / WAF / MFA in this phase.

## Headers & CSP

Source of truth: Next.js `middleware.ts` via `lib/security/headers.ts` + `lib/security/csp.ts`.

| Header | Default |
|--------|---------|
| Content-Security-Policy | On (`ENABLE_CSP=true`). Report-only in non-production (`CSP_REPORT_ONLY`) |
| Strict-Transport-Security | On in production when `ENABLE_HSTS=true` |
| X-Frame-Options | `DENY` (plus CSP `frame-ancestors 'none'`) |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | camera/mic/geo/payment/usb disabled |
| Cross-Origin-Opener-Policy | `same-origin` |
| Cross-Origin-Resource-Policy | `same-origin` |

### CSP exceptions

1. **Auth0** — `script-src` / `connect-src` / `frame-src` / `form-action` allow Auth0 tenant + `*.auth0.com`.
2. **`style-src 'unsafe-inline'`** — required for Next.js App Router + Tailwind in this codebase. Prefer nonces later.
3. **`script-src 'unsafe-eval'`** — development HMR only (not production).

## Rate limiting

In-process sliding window (`lib/security/rate-limit.ts`):

| Bucket | Default | Applied |
|--------|---------|---------|
| auth | 20 / min | `/login`, `/api/auth` (middleware) |
| api | 120 / min | other HTTP (middleware) |
| health | 60 / min | `/api/health` (middleware) |
| expensive | 10 / min | ZAP, Wazuh sync, reports, archive (server actions) |

Keys include IP + userId + organizationId + action when available. **Not shared across replicas.**

429 JSON: `{ success: false, error, code: "RATE_LIMITED", requestId }` + `Retry-After`.

## Session & cookies

Auth.js cookies (production):

- `__Secure-authjs.session-token` — `HttpOnly`, `Secure`, `SameSite=Lax`
- CSRF: `__Host-authjs.csrf-token` — `HttpOnly`, `Secure`, `SameSite=Lax`
- Session max age: 8h (`AUTH_SESSION_MAX_AGE_SECONDS`)

CSRF: Auth.js built-in token cookies. Server Actions use Next.js POST + origin checks.

## Authorization audit summary

| Surface | Auth | Notes |
|---------|------|-------|
| Dashboard Server Actions | `requireSession` + usually `assertMinimumRole` | Fail closed |
| Notifications / prefs | `requireSession` only | Self-service inbox/preferences (intentional) |
| `logoutAction` | No session required | Signs out / clears bypass |
| `GET /api/health` | Public | Rate-limited |
| `GET /api/dashboard/stats` | `getOrganizationId` → session | Cookie gate in middleware |
| `/api/auth/*` | Public Auth.js | Rate-limited |

Org scoping: services query by `session.organizationId`. Role failures log `authz_failed`.

## Delete safeguards

- **Organisation hard-delete:** not implemented in app code (`refuseOrganizationHardDelete`).
- **Client offboard / asset archive / user disable:** require confirmation phrases `OFFBOARD` / `ARCHIVE` / `DISABLE`, ADMIN role, audit log.
- Soft-archive only — no bulk delete APIs.

## Configuration

| Variable | Production default |
|----------|-------------------|
| `ENABLE_HSTS` | `true` when `NODE_ENV=production` |
| `ENABLE_CSP` | `true` |
| `CSP_REPORT_ONLY` | `false` in production, `true` otherwise |
| `ENABLE_RATE_LIMITING` | `true` |
| `RATE_LIMIT_*` | See table above |
| `AUTH_SESSION_MAX_AGE_SECONDS` | `28800` (8h) |

## Tests

```bash
npm run test:security
npm run test:auth
```
