# ClientShield

ClientShield is a multi-tenant cybersecurity monitoring and vulnerability management platform built for companies that develop websites and provide IoT solutions.

This repository contains the application foundation — secure multi-tenant workflows, Auth0 authentication, Wazuh/ZAP integrations, and a production deployment baseline (Docker, Compose, nginx). See [DEPLOYMENT.md](./DEPLOYMENT.md) and [PRODUCTION.md](./PRODUCTION.md) for first production deploy.

## What ClientShield Will Do

- Manage clients and their digital assets
- Monitor SSL/TLS certificates and HTTP security headers
- Track vulnerabilities and remediation workflows
- Calculate security posture scores
- Manage security incidents and generate reports
- Maintain IoT device inventories
- Integrate authorized security scanning tools

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS 4 |
| Backend | Next.js API Routes + Server Actions |
| Database | PostgreSQL with Prisma ORM |
| Validation | Zod |
| Authentication | Auth.js (NextAuth v5) + Auth0 (production fail-closed) |
| Deployment | Docker multi-stage image, Compose, nginx reverse proxy |

## Project Structure

```
app/                  # Next.js App Router pages and API routes
  (dashboard)/        # Main application sections
  api/                # Server-side API endpoints (includes /api/health)
components/           # Reusable UI and layout components
lib/                  # Shared utilities, auth, validations, startup
  auth/               # Auth.js + Auth0 helpers
  startup/            # Production startup validation
prisma/               # Database schema and migrations
services/             # Business logic layer
workers/              # Background workers (Wazuh sync, SLA escalation)
nginx/                # Production reverse proxy config
scripts/              # Entrypoint, backups, tests
```

## Prerequisites

- **Node.js** 20.x or later
- **npm** 10.x or later
- **PostgreSQL** 14.x or later (or Docker Compose)
- **Docker** + Compose (for ZAP, production stack)

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd ClientShield-project

# Install dependencies
npm install
```

## PostgreSQL Setup

### Local Docker (recommended for development)

```bash
docker compose up -d postgres
```

Default connection (matches `.env.example`):

```
postgresql://clientshield_dev:clientshield_dev_password@localhost:5432/clientshield?schema=public
```

### Manual Postgres

1. Create a PostgreSQL database:

```sql
CREATE DATABASE clientshield;
CREATE USER clientshield_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE clientshield TO clientshield_user;
```

2. Note your connection string format:

```
postgresql://clientshield_user:your_secure_password@localhost:5432/clientshield?schema=public
```

## Environment Variables

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Update `.env` with your values:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `NODE_ENV` | `development`, `test`, or `production` | Yes |
| `NEXT_PUBLIC_APP_NAME` | Application display name | No |
| `NEXT_PUBLIC_APP_URL` | Public application URL (required in production) | Prod |
| `AUTH_SECRET` | Auth.js session secret | Prod |
| `AUTH_PROVIDER` | `auth0` in production | Prod |
| `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` / `AUTH0_ISSUER` | Auth0 application | Prod |
| `AUTH_DEV_BYPASS` | Local-only session bypass (`true` only when `NODE_ENV=development`) | Dev |
| `BUILD_VERSION` / `GIT_SHA` | Build metadata for `/api/health` | Recommended |

> **Security:** Never commit `.env` files. Real credentials must stay out of version control. The `.gitignore` excludes all `.env*` files except `.env.example`.

Full production variable notes: [DEPLOYMENT.md](./DEPLOYMENT.md).

## Database Migrations

```bash
# Generate Prisma client
npm run db:generate

# Run migrations (creates tables)
npm run db:migrate

# Optional: Open Prisma Studio to inspect data
npm run db:studio
```

For rapid prototyping without migrations:

```bash
npm run db:push
```

## Development Server

```bash
docker compose up -d          # postgres + zap
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) to view the dashboard.

Health probe (also used in production):

```bash
curl -sS http://localhost:3001/api/health
```

## Production deployment (summary)

```bash
cp .env.example .env.production   # set real secrets + Auth0 + DATABASE_URL
docker compose -f compose.production.yaml --env-file .env.production up -d --build
curl -sS http://127.0.0.1/api/health
```

Details: [DEPLOYMENT.md](./DEPLOYMENT.md) · [PRODUCTION.md](./PRODUCTION.md)

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server on port 3001 |
| `npm run build` | Production build (standalone output) |
| `npm run start` | Start production server on port 3001 |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run test:observability` | Logger, context, metrics, errors, worker wrappers |
| `npm run test:health` | Health service / endpoint checks |
| `npm run test:startup-env` | Production env fail-closed checks |
| `npm run docker:build` | Build production Docker image |
| `npm run compose:prod:config` | Validate production Compose file |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run database migrations |
| `npm run db:push` | Push schema to database (no migration files) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run wazuh:worker` | Run Wazuh sync worker |
| `npm run sla:escalation-worker` | Run SLA escalation worker |

## Current Project Status

### Implemented

- Next.js application with App Router and TypeScript
- Multi-tenant Clients, Assets, Findings, Investigations, Incidents
- Auth0 / Auth.js authentication (fail-closed in production)
- Passive website security checks (HTTPS/TLS/headers/cookies)
- OWASP ZAP **baseline / passive** scanning (spider + passive alerts only — no Active Scan)
- Wazuh read-only ingestion + background workers
- Production Docker image, Compose, nginx, `/api/health`, backup scripts

### Not Yet Implemented

- Automated backups, metrics, tracing, Sentry (post-6P1)
- Rate limiting, CSP, HSTS (post-6P1)
- OWASP ZAP Active Scan (intentionally out of scope)
- CLIENT role read-only portal access (requires client-to-user mapping)
- IoT device scanning (future)

### Findings recurrence strategy

Passive checks upsert findings by `(organizationId, assetId, code)`:

- Unresolved findings (`OPEN` / `VALIDATED` / `IN_PROGRESS`) update `lastDetectedAt` when still present
- Unresolved findings are auto-`RESOLVED` (with `resolvedAt`) when the issue disappears
- `ACCEPTED_RISK` and `FALSE_POSITIVE` are never auto-resolved or auto-reopened
- Previously `RESOLVED` findings are reopened to `OPEN` when the issue returns (same row)

### OWASP ZAP baseline

- Docker service: `zap` (`clientshield-zap`), image `ghcr.io/zaproxy/zaproxy:stable`
- Internal port `8080`; local host bind `127.0.0.1:8090` only (not public)
- API key required (`ZAP_API_KEY`); no `/var/run/docker.sock` mount
- Scan type: `ZAP_BASELINE` — traditional spider + passive scan only (never Active Scan APIs)
- Findings source: `OWASP_ZAP`; dedupe key `ZAP:{pluginId}:{pathHash}:{param}`
- **Resolution policy:** ZAP findings are **not** auto-resolved when absent from a later baseline scan (absence ≠ remediation)
- Recurrence: `RESOLVED` → reopen on re-detection; never auto-reopen `ACCEPTED_RISK` / `FALSE_POSITIVE`

#### Start ZAP (do not scan third-party sites automatically)

```bash
# From project root — starts postgres + zap only (does not touch unrelated containers)
docker compose up -d postgres zap

# Confirm ZAP API (requires matching ZAP_API_KEY)
curl -s "http://127.0.0.1:8090/JSON/core/view/version/?apikey=$ZAP_API_KEY"
```

#### Manual first baseline scan

1. Ensure your asset is `WEBSITE`/`WEB_APPLICATION`, `AUTHORIZED`, `ACTIVE`, with a stored URL
2. Open the asset at http://localhost:3001/assets/{id}
3. Click **Run ZAP Baseline Scan** → read the confirmation → Confirm
4. Review Security Checks → ZAP Baseline Scans history and `/vulnerabilities`

**Docker Desktop limitation:** ZAP needs egress to reach public targets. Host-level / metadata egress filtering inside Docker Desktop is limited; ClientShield still runs SSRF checks before starting a scan.

## Security Considerations

- See [SECURITY.md](./SECURITY.md) for CSP, HSTS, rate limits, cookies, and authorization audit.
- **Secrets:** Server-side environment variables are never exposed to the client. Only `NEXT_PUBLIC_*` variables are browser-accessible. Docker builds do not bake `.env` files.
- **Tenant isolation:** All business resources belong to an `Organization`. Server-side code must resolve `organizationId` from the authenticated session — never from client-supplied input.
- **Input validation:** All server inputs must be validated with Zod schemas in `lib/validations/`.
- **Authentication:** Production uses Auth0 via Auth.js. `AUTH_DEV_BYPASS` works only when `NODE_ENV=development` and is refused in production.
- **Authorization:** Permission helpers exist in `lib/auth/permissions.ts`. ZAP scans require ANALYST+.
- **Security headers:** Middleware emits CSP, HSTS (prod), COOP/CORP, and baseline headers (see SECURITY.md).
- **No active scanning:** ClientShield does not invoke ZAP Active Scan, fuzzing, or exploitation in this phase.

## License

Proprietary — All rights reserved.
