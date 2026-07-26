/**
 * Periodic SLA escalation worker (Phase 4c + 6P2 observability).
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
import {
  bindObservabilityContext,
  logger,
  withWorkerRun,
} from "../lib/observability";
import { runSlaEscalationEvaluationPass } from "../services/escalation/sla-escalation-evaluator.service";
import {
  SlaEscalationLockError,
  acquireSlaEscalationLock,
  releaseSlaEscalationLock,
  touchSlaEscalationHeartbeat,
} from "../services/escalation/sla-escalation-lock.service";

const log = logger.child({ service: "sla-escalation-worker" });

async function main() {
  if (!serverEnv.SLA_ESCALATION_ENABLED) {
    log.info(
      "SLA_ESCALATION_ENABLED=false — worker idle exit. Set SLA_ESCALATION_ENABLED=true to enable."
    );
    process.exit(0);
  }

  const workerId =
    serverEnv.SLA_ESCALATION_WORKER_ID?.trim() ||
    `sla-esc-${randomUUID().slice(0, 8)}`;
  const intervalMs = serverEnv.SLA_ESCALATION_INTERVAL_SECONDS * 1000;

  bindObservabilityContext({
    service: "sla-escalation-worker",
    workerId,
  });

  log.info("SLA escalation worker starting", {
    action: "worker.start",
    workerId,
    intervalSeconds: serverEnv.SLA_ESCALATION_INTERVAL_SECONDS,
  });

  let stopping = false;
  const shutdown = () => {
    stopping = true;
    log.info("Shutdown signal received", { action: "worker.shutdown" });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (!stopping) {
    const lockedBy = `worker:${workerId}`;
    try {
      await acquireSlaEscalationLock({ lockedBy });
    } catch (error) {
      if (error instanceof SlaEscalationLockError) {
        log.info("Skipped pass — lock held by another instance", {
          action: "sla.escalation.skipped",
        });
      } else {
        const message =
          error instanceof Error ? error.message : "Unknown worker error";
        await touchSlaEscalationHeartbeat({
          workerId,
          error: message,
        }).catch(() => {});
        log.error("Escalation lock acquire failed", {
          action: "sla.escalation.lock_failed",
          err: error instanceof Error ? error : new Error(message),
        });
      }
      const wakeSkip = Date.now() + intervalMs;
      while (!stopping && Date.now() < wakeSkip) {
        await touchSlaEscalationHeartbeat({ workerId }).catch(() => {});
        await new Promise((r) =>
          setTimeout(r, Math.min(15_000, wakeSkip - Date.now()))
        );
      }
      continue;
    }

    try {
      await withWorkerRun(
        {
          service: "sla-escalation-worker",
          action: "sla.escalation",
          workerId,
        },
        async () => {
          try {
            await touchSlaEscalationHeartbeat({ workerId });
            log.debug("worker.heartbeat", {
              action: "heartbeat",
              workerId,
            });
            const result = await runSlaEscalationEvaluationPass();
            await touchSlaEscalationHeartbeat({ workerId, success: true });
            log.info("Escalation pass completed", {
              action: "sla.escalation.finish",
              ...result,
            });
          } finally {
            await releaseSlaEscalationLock({ lockedBy });
          }
        }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown worker error";
      await touchSlaEscalationHeartbeat({
        workerId,
        error: message,
      }).catch(() => {});
      log.error("Escalation pass failed", {
        action: "sla.escalation.failed",
        err: error instanceof Error ? error : new Error(message),
      });
    }

    const wake = Date.now() + intervalMs;
    while (!stopping && Date.now() < wake) {
      await touchSlaEscalationHeartbeat({ workerId }).catch(() => {});
      await new Promise((r) =>
        setTimeout(r, Math.min(15_000, wake - Date.now()))
      );
    }
  }

  log.info("Worker stopped cleanly", { action: "worker.stop" });
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  log.fatal("Fatal worker error", {
    action: "worker.fatal",
    err: error instanceof Error ? error : new Error("unknown"),
  });
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
