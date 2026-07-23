/**
 * Periodic SLA escalation worker (Phase 4c).
 *
 * Usage:
 *   npm run sla:escalation-worker
 *
 * Requires:
 *   SLA_ESCALATION_ENABLED=true
 *   DATABASE_URL
 *
 * Default interval ~60s. Does not touch Wazuh ingestion checkpoint or locks.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db";
import { serverEnv } from "../lib/env";
import { runSlaEscalationEvaluationPass } from "../services/escalation/sla-escalation-evaluator.service";
import {
  SlaEscalationLockError,
  acquireSlaEscalationLock,
  releaseSlaEscalationLock,
  touchSlaEscalationHeartbeat,
} from "../services/escalation/sla-escalation-lock.service";

function log(level: "info" | "warn" | "error", message: string, meta?: object) {
  const line = {
    ts: new Date().toISOString(),
    level,
    service: "sla-escalation-worker",
    message,
    ...meta,
  };
  // eslint-disable-next-line no-console
  console[level === "info" ? "log" : level](JSON.stringify(line));
}

async function main() {
  if (!serverEnv.SLA_ESCALATION_ENABLED) {
    log(
      "info",
      "SLA_ESCALATION_ENABLED=false — worker idle exit. Set SLA_ESCALATION_ENABLED=true to enable."
    );
    process.exit(0);
  }

  const workerId =
    serverEnv.SLA_ESCALATION_WORKER_ID?.trim() ||
    `sla-esc-${randomUUID().slice(0, 8)}`;
  const intervalMs = serverEnv.SLA_ESCALATION_INTERVAL_SECONDS * 1000;

  log("info", "SLA escalation worker starting", {
    workerId,
    intervalSeconds: serverEnv.SLA_ESCALATION_INTERVAL_SECONDS,
  });

  let stopping = false;
  const shutdown = () => {
    stopping = true;
    log("info", "Shutdown signal received");
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (!stopping) {
    const lockedBy = `worker:${workerId}`;
    try {
      await acquireSlaEscalationLock({ lockedBy });
      try {
        await touchSlaEscalationHeartbeat({ workerId });
        const result = await runSlaEscalationEvaluationPass();
        await touchSlaEscalationHeartbeat({ workerId, success: true });
        log("info", "Escalation pass completed", result);
      } finally {
        await releaseSlaEscalationLock({ lockedBy });
      }
    } catch (error) {
      if (error instanceof SlaEscalationLockError) {
        log("info", "Skipped pass — lock held by another instance");
      } else {
        const message =
          error instanceof Error ? error.message : "Unknown worker error";
        await touchSlaEscalationHeartbeat({
          workerId,
          error: message,
        }).catch(() => {});
        log("error", "Escalation pass failed", {
          error: message.slice(0, 300),
        });
      }
    }

    const wake = Date.now() + intervalMs;
    while (!stopping && Date.now() < wake) {
      await touchSlaEscalationHeartbeat({ workerId }).catch(() => {});
      await new Promise((r) =>
        setTimeout(r, Math.min(15_000, wake - Date.now()))
      );
    }
  }

  log("info", "Worker stopped cleanly");
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  log("error", "Fatal worker error", {
    error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
  });
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
