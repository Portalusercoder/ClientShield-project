# ClientShield

ClientShield is a multi-tenant cybersecurity monitoring and vulnerability management platform built for companies that develop websites and provide IoT solutions.

This repository contains the **MVP application foundation** — a secure, scalable architecture with dashboard UI, database schema, and authentication-ready structure. Active vulnerability scanning, IoT scanning, and third-party scanner integrations are intentionally **not** implemented yet.

## What ClientShield Will Do

- Manage clients and their digital assets
- Monitor SSL/TLS certificates and HTTP security headers
- Track vulnerabilities and remediation workflows
- Calculate security posture scores
- Manage security incidents and generate reports
- Maintain IoT device inventories
- Integrate authorized security scanning tools (future)

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS 4 |
| Backend | Next.js API Routes (structured for future NestJS extraction) |
| Database | PostgreSQL with Prisma ORM |
| Validation | Zod |
| Authentication | Modular auth-ready architecture (IdP integration pending) |

## Project Structure

```
app/                  # Next.js App Router pages and API routes
  (dashboard)/        # Main application sections
  api/                # Server-side API endpoints
components/           # Reusable UI and layout components
  dashboard/          # Dashboard-specific components
  layout/             # Sidebar, header, shell layout
  ui/                 # Generic UI primitives
lib/                  # Shared utilities, auth, validations, mock data
  auth/               # Authentication module (IdP-ready)
  mock-data/          # Clearly marked mock data for MVP
  validations/        # Zod schemas for server-side validation
prisma/               # Database schema and migrations
services/             # Business logic layer (NestJS-extractable)
types/                # Shared TypeScript types
```

## Prerequisites

- **Node.js** 20.x or later
- **npm** 10.x or later
- **PostgreSQL** 14.x or later

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd ClientShield-project

# Install dependencies
npm install
```

## PostgreSQL Setup

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
| `NEXT_PUBLIC_APP_URL` | Public application URL | No |
| `AUTH_SECRET` | Session/JWT secret (for future auth) | No |
| `AUTH_PROVIDER` | Identity provider (`none`, `auth0`, `clerk`, `azure-ad`) | No |

> **Security:** Never commit `.env` files. Real credentials must stay out of version control. The `.gitignore` excludes all `.env*` files except `.env.example`.

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
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) to view the dashboard.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server on port 3001 |
| `npm run build` | Production build |
| `npm run start` | Start production server on port 3001 |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run database migrations |
| `npm run db:push` | Push schema to database (no migration files) |
| `npm run db:studio` | Open Prisma Studio |

## Current Project Status

### Implemented

- Next.js application with App Router and TypeScript
- Multi-tenant Clients, Assets, Findings, and Remediation workflows
- Passive website security checks (HTTPS/TLS/headers/cookies)
- OWASP ZAP **baseline / passive** scanning (spider + passive alerts only — no Active Scan)
- Findings management with assignment, accepted risk, false positive, and remediation tasks

### Not Yet Implemented

- Production identity provider integration (Auth0, Clerk, Azure AD)
- OWASP ZAP Active Scan (intentionally out of scope)
- CLIENT role read-only portal access (requires client-to-user mapping)
- Live dashboard sections still marked mock (incidents, remediation metrics chart)
- IoT device scanning and report generation

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

- **Secrets:** Server-side environment variables are never exposed to the client. Only `NEXT_PUBLIC_*` variables are browser-accessible.
- **Tenant isolation:** All business resources belong to an `Organization`. Server-side code must resolve `organizationId` from the authenticated session — never from client-supplied input.
- **Input validation:** All server inputs must be validated with Zod schemas in `lib/validations/`.
- **Authentication:** A mock development session is active in `lib/auth/session.ts`. Replace with a production IdP before deployment.
- **Authorization:** Permission helpers exist in `lib/auth/permissions.ts`. ZAP scans require ANALYST+.
- **Security headers:** Basic headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy) are set in `middleware.ts`.
- **No active scanning:** ClientShield does not invoke ZAP Active Scan, fuzzing, or exploitation in this phase.

## License

Proprietary — All rights reserved.
