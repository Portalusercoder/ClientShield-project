# Observability (Phase 6P2)

ClientShield ships an in-process observability foundation. No Sentry, Prometheus, OpenTelemetry, or cloud logging in this phase.

## What you get

| Capability | Location |
|------------|----------|
| Structured JSON logs | `lib/observability/logger.ts` |
| Request / correlation context (ALS) | `lib/observability/context.ts` |
| Error helpers (safe client mapping) | `lib/observability/errors.ts` |
| In-memory metrics counters | `lib/observability/metrics.ts` |
| Timing / slow queries | `lib/observability/timing.ts` |
| Diagnostics snapshot | `lib/observability/diagnostics.ts` |
| Request IDs in middleware | `middleware.ts` (`x-request-id`, `x-correlation-id`) |

## Log fields

Every log line aims to include: `timestamp`, `level`, `service`, `action`, `message`, plus when available `requestId`, `correlationId`, `organizationId`, `userId`, and workflow entity ids. Secrets are redacted.

Levels: `TRACE` `DEBUG` `INFO` `WARN` `ERROR` `FATAL`.

## Configuration

| Variable | Default | Notes |
|----------|---------|-------|
| `LOG_LEVEL` | `INFO` | Minimum level emitted |
| `LOG_FORMAT` | `json` | `pretty` for local readability |
| `ENABLE_DEBUG_LOGS` | `false` | When `true` and `LOG_LEVEL` unset → `DEBUG` |
| `ENABLE_REQUEST_LOGGING` | non-prod `true` | Timing completion at INFO |
| `ENABLE_METRICS` | `true` | In-process counters |
| `SLOW_QUERY_MS` | `500` | Prisma slow-query warn threshold |
| `BUILD_VERSION` / `GIT_SHA` / `BUILD_TIME` | — | Diagnostics / health |

## Correlation

- HTTP: middleware assigns `x-request-id` / `x-correlation-id` (honors inbound values).
- Server Actions / API: `requireSession` / `withApiRoute` bind ALS context.
- Workers: `withWorkerRun` creates a run context; heartbeats and sync finish are logged.
- Domain creates (incident / investigation / finding / notification) update correlation + counters.

## Metrics (in-process)

Counters: `requests`, `errors`, `worker_runs`, `worker_failures`, `wazuh_syncs`, `notifications_produced`, `investigations_created`, `findings_created`, `incidents_created`.

Snapshot appears under `/api/health` → `diagnostics.metrics` (no Prometheus scrape yet).

## Tests

```bash
npm run test:observability
npm run test:health
```
