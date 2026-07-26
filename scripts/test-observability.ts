/**
 * Phase 6P2 — observability foundation tests.
 * Run: npm run test:observability
 */
import {
  AppError,
  AuthorizationError,
  ValidationError,
  getObservabilityContext,
  metrics,
  normalizeError,
  redactObject,
  resetObservabilityConfigCache,
  runWithObservabilityContext,
  toSafeError,
  withTiming,
  withWorkerRun,
  workflowCorrelationId,
} from "../lib/observability";
import { getObservabilityConfig } from "../lib/observability/config";
import { logger } from "../lib/observability/logger";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function testLoggerRedaction() {
  const redacted = redactObject({
    password: "secret",
    token: "abc",
    DATABASE_URL: "postgresql://u:p@localhost/db",
    ok: "value",
    nested: { AUTH_SECRET: "x", count: 1 },
  });
  assert(redacted.password === "[REDACTED]", "password redacted");
  assert(redacted.token === "[REDACTED]", "token redacted");
  assert(redacted.DATABASE_URL === "[REDACTED]", "db url redacted");
  assert(redacted.ok === "value", "safe value kept");
  assert(
    (redacted.nested as Record<string, unknown>).AUTH_SECRET === "[REDACTED]",
    "nested secret"
  );
  assert((redacted.nested as Record<string, unknown>).count === 1, "nested ok");

  // Smoke: logger does not throw
  logger.info("observability.test", { action: "testLoggerRedaction", ok: true });
}

async function testContextPropagation() {
  await runWithObservabilityContext(
    {
      requestId: "req-1",
      correlationId: "corr-1",
      organizationId: "org-1",
      userId: "user-1",
      service: "test",
      action: "context",
    },
    async () => {
      const ctx = getObservabilityContext();
      assert(ctx?.requestId === "req-1", "requestId");
      assert(ctx?.correlationId === "corr-1", "correlationId");
      assert(ctx?.organizationId === "org-1", "organizationId");
      assert(ctx?.userId === "user-1", "userId");

      await runWithObservabilityContext(
        { investigationId: "inv-1" },
        async () => {
          const child = getObservabilityContext();
          assert(child?.requestId === "req-1", "child keeps requestId");
          assert(child?.investigationId === "inv-1", "child investigationId");
          const wf = workflowCorrelationId("inv", "inv-1-abcdefgh");
          assert(wf.includes("corr-1"), "workflow correlation uses parent");
          assert(wf.includes("inv"), "workflow correlation kind");
        }
      );
    }
  );
}

async function testMetrics() {
  metrics.reset();
  metrics.inc("requests");
  metrics.inc("errors", 2);
  metrics.inc("worker_runs");
  metrics.inc("wazuh_syncs");
  metrics.inc("notifications_produced");
  metrics.inc("investigations_created");
  metrics.inc("findings_created");
  metrics.inc("incidents_created");
  const snap = metrics.snapshot();
  assert(snap.requests === 1, "requests");
  assert(snap.errors === 2, "errors");
  assert(snap.worker_runs === 1, "worker_runs");
  assert(snap.incidents_created === 1, "incidents_created");
}

async function testErrorHelpers() {
  const auth = normalizeError(new Error("Unauthorized"));
  assert(auth instanceof AuthorizationError || auth.code === "AUTHORIZATION_ERROR", "auth map");

  const unexpected = toSafeError(new Error("boom secret stack"), {
    requestId: "r1",
    action: "test",
  });
  assert(unexpected.httpStatus === 500, "500");
  assert(unexpected.client.error === "An unexpected error occurred", "safe msg");
  assert(unexpected.client.code === "UNEXPECTED_ERROR", "code");
  assert(!unexpected.client.error.includes("boom"), "no leak");

  const validation = toSafeError(new ValidationError("bad input"), {
    requestId: "r2",
  });
  assert(validation.httpStatus === 400, "400");
  assert(validation.client.error === "bad input", "validation msg");

  const app = toSafeError(
    new AppError({
      code: "CONFLICT",
      message: "already exists",
      httpStatus: 409,
    })
  );
  assert(app.httpStatus === 409, "409");
}

async function testWorkerInstrumentation() {
  metrics.reset();
  let ran = false;
  await withWorkerRun(
    {
      service: "test-worker",
      action: "test.pass",
      workerId: "w1",
      organizationId: "org",
    },
    async () => {
      ran = true;
      const ctx = getObservabilityContext();
      assert(ctx?.workerId === "w1", "workerId in context");
      assert(ctx?.service === "test-worker", "service");
    }
  );
  assert(ran, "worker ran");
  assert(metrics.get("worker_runs") === 1, "worker_runs metric");

  let failed = false;
  try {
    await withWorkerRun(
      {
        service: "test-worker",
        action: "test.fail",
        workerId: "w2",
      },
      async () => {
        throw new Error("fail");
      }
    );
  } catch {
    failed = true;
  }
  assert(failed, "worker failure propagates");
  assert(metrics.get("worker_failures") === 1, "worker_failures");
}

async function testTiming() {
  const result = await withTiming("test.timing", async () => 42);
  assert(result === 42, "timing returns value");
}

async function testConfigDefaults() {
  resetObservabilityConfigCache();
  delete process.env.LOG_LEVEL;
  delete process.env.ENABLE_DEBUG_LOGS;
  resetObservabilityConfigCache();
  const cfg = getObservabilityConfig();
  assert(cfg.logLevel === "INFO", "default INFO");
  assert(cfg.logFormat === "json", "default json");
  assert(cfg.enableMetrics === true, "metrics on");
}

async function main() {
  await testConfigDefaults();
  await testLoggerRedaction();
  await testContextPropagation();
  await testMetrics();
  await testErrorHelpers();
  await testWorkerInstrumentation();
  await testTiming();
  console.log("OK observability foundation tests");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
