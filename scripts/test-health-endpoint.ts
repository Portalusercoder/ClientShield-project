/**
 * Phase 6P1 — health endpoint + health service smoke tests.
 * Run: npm run test:health
 *
 * Uses an in-process call to getHealthCheckResult (requires DATABASE_URL).
 * Optional: HEALTH_BASE_URL=http://127.0.0.1:3001 to also HTTP-probe a running server.
 */
import { getHealthCheckResult } from "../services/health.service";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const result = await getHealthCheckResult();

  assert(result.status === "ok" || result.status === "degraded" || result.status === "error", "status enum");
  assert(typeof result.version === "string" && result.version.length > 0, "version");
  assert(typeof result.gitSha === "string", "gitSha");
  assert(typeof result.environment === "string", "environment");
  assert(result.diagnostics == null || typeof result.diagnostics === "object", "diagnostics");
  assert(typeof result.timestamp === "string", "timestamp");
  assert(typeof result.uptimeSeconds === "number", "uptimeSeconds");
  assert(result.checks.application.status === "ok", "application check");
  assert(
    result.checks.database.status === "ok" || result.checks.database.status === "error",
    "database status"
  );
  assert(
    result.checks.prisma.status === "ok" || result.checks.prisma.status === "error",
    "prisma status"
  );
  assert(result.checks.workers.wazuh, "wazuh worker block");
  assert(result.checks.workers.slaEscalation, "sla worker block");

  // Never leak connection strings / secrets in the payload
  const json = JSON.stringify(result);
  assert(!/postgresql:\/\//i.test(json), "must not include DATABASE_URL");
  assert(!/AUTH_SECRET|CLIENT_SECRET|PASSWORD=/i.test(json), "must not include secrets");

  if (result.checks.database.status !== "ok") {
    console.error("FAIL: database not reachable — ensure Postgres is up and DATABASE_URL is set");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log("OK in-process health:", {
    status: result.status,
    version: result.version,
    environment: result.environment,
    dbLatencyMs: result.checks.database.latencyMs,
    wazuh: result.checks.workers.wazuh.status,
    sla: result.checks.workers.slaEscalation.status,
  });

  const base = process.env.HEALTH_BASE_URL?.replace(/\/$/, "");
  if (base) {
    const res = await fetch(`${base}/api/health`);
    const body = (await res.json()) as { status?: string };
    assert(res.status === 200 || res.status === 503, `HTTP status ${res.status}`);
    assert(body.status, "HTTP body.status");
    console.log("OK HTTP health:", { httpStatus: res.status, status: body.status });
  } else {
    console.log("Skip HTTP probe (set HEALTH_BASE_URL to enable)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
