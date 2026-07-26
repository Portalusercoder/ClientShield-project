# ClientShield Architecture

This document describes the application architecture after Phase 6P4 (targeted refactoring). It is descriptive, not aspirational — behavior and schema are unchanged by that phase.

## Stack

- **Next.js 15** App Router (UI + Server Actions + Route Handlers)
- **PostgreSQL** via **Prisma**
- **Auth.js (NextAuth v5)** + Auth0 in production
- Background **workers** for Wazuh sync and SLA escalation

## High-level layout

```
app/                    # Routes, pages, Server Actions
  (dashboard)/          # Authenticated product surfaces
  (auth)/               # Login / session entry
  api/                  # HTTP endpoints (health, webhooks, etc.)
components/             # UI (feature folders + shared ui/ + workflow/)
lib/                    # Cross-cutting helpers (auth, env, security, observability, actions)
services/               # Domain business logic (org-scoped)
prisma/                 # Schema + migrations (do not change without an approved schema phase)
types/                  # Shared DTOs and ActionResult
workers/                # Long-running jobs
```

## Module responsibilities

| Layer | Responsibility |
| --- | --- |
| `app/**/page.tsx` | Load session/org context, call services, pass DTOs to views |
| `app/**/actions.ts` | Server Actions: session, role, Zod validation, call services, `revalidatePath`, `ActionResult` |
| `services/**` | Org-scoped business rules, Prisma access, audit/notifications |
| `components/**` | Presentation + client interactivity; no direct Prisma |
| `lib/**` | Auth, validation schemas, security, observability, shared action helpers |
| `types/**` | Shared contracts (list/detail DTOs, `ActionResult`) |

## Domain service organization

Large domains are split by responsibility while **public import paths stay stable** via barrel files:

| Public import | Internal modules |
| --- | --- |
| `@/services/incidents.service` | `services/incidents/{queries,commands,sla,shared}.ts` (+ case/evidence/playbook/…) |
| `@/services/security-events.service` | `services/security-events/{queries,lifecycle,incident-bridge,shared}.ts` |
| `@/services/investigations/investigation.service` | queries / grouping / lifecycle / findings / observables / … |
| `@/services/attention/attention.service` | `fetchers.ts`, `attention-compare.ts`, plus `attention-state.service.ts` |

Prefer importing the **public barrel** from app code unless you are extending the same domain module.

## UI organization

Large detail screens are orchestrators that own state and pass props to tab/header children:

- `components/incidents/incident-detail-view.tsx` → `components/incidents/detail/*`
- `components/investigations/investigation-detail-view.tsx` → `components/investigations/detail/*`
- `components/clients/client-detail-view.tsx` → `components/clients/detail/*`
- `components/assets/asset-detail-view.tsx` → `components/assets/detail/*`

Shared presentational primitives live under `components/ui/` and workflow chrome under `components/workflow/`.

## Server Action conventions

1. `"use server"` at file top
2. `requireSession()` (or `requireActionSession(role)`) — organization always from session
3. `assertMinimumRole` / role checks
4. Zod `safeParse` on input
5. Call service with `{ organizationId, actorId, … }`
6. Return canonical `ActionResult` from `@/types/action-result` (via `@/lib/actions`)
7. Use `toActionError(error)` for catch blocks
8. `revalidatePath` for affected list/detail routes
9. Never leak stacks or internal details to the client for unexpected failures (`AppError` 5xx → generic message)

Helpers: `@/lib/actions` (`toActionError`, `actionOk`, `actionFail`, `zodFirstError`, `requireActionSession`).

## Multi-tenancy

Every data read/write must be scoped by `organizationId` from the session. Client isolation helpers in `lib/client-isolation.ts` enforce target-client consistency where cross-entity links exist.

## Observability & security

- Logging/metrics/context: `lib/observability/` (see `OBSERVABILITY.md`)
- Headers, CSP, rate limits, destructive confirmations: `lib/security/` (see `SECURITY.md`)
- Deployment: `DEPLOYMENT.md`, `PRODUCTION.md`

## Refactoring notes (Phase 6P4)

- Goal: reduce file size and clarify boundaries **without** changing behavior, schema, or UX.
- Detail views were split into tabs; public component APIs unchanged.
- Services were split by queries/commands/lifecycle; barrels preserve exports.
- Duplicate `ActionResult` definitions consolidated to `types/action-result.ts`.
- Prefer extracting pure helpers (compare/sort/format) next to the domain that owns them.

## What not to put where

- Do not query Prisma from React components.
- Do not put business rules in Server Actions beyond auth, validation, and orchestration.
- Do not introduce schema/migrations in maintainability-only work.
- Do not redesign UX while extracting components.
