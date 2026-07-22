/**
 * Background worker for scheduled incremental Wazuh ingestion.
 *
 * Usage:
 *   npm run wazuh:worker
 *
 * Requires:
 *   WAZUH_ENABLED=true
 *   WAZUH_AUTO_SYNC_ENABLED=true
 *   WAZUH_ORGANIZATION_ID=<org>
 *   DATABASE_URL + Wazuh TLS/credentials as usual
 *
 * Default auto-sync is disabled — enable only after review.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db";
import { serverEnv } from "../lib/env";
import { touchWazuhWorkerHeartbeat } from "../services/wazuh/wazuh-ingestion-lock.service";
import { syncWazuhNewEventsFromCheckpoint } from "../services/wazuh/wazuh-ingestion.service";
import { runPostIngestionInvestigationHooks } from "../services/investigations/post-ingestion.service";

function log(level: "info" | "warn" | "error", message: string, meta?: object) {
  const line = {
    ts: new Date().toISOString(),
    level,
    service: "wazuh-sync-worker",
    message,
    ...meta,
  };
  // eslint-disable-next-line no-console
  console[level === "info" ? "log" : level](JSON.stringify(line));
}

async function resolveActorId(organizationId: string): Promise<string> {
  if (serverEnv.WAZUH_WORKER_ACTOR_USER_ID) {
    return serverEnv.WAZUH_WORKER_ACTOR_USER_ID;
  }
  const user = await prisma.user.findFirst({
    where: {
      organizationId,
      role: { in: ["OWNER", "ADMIN", "ANALYST"] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!user) {
    throw new Error(
      "No organization user available for worker audit actor. Set WAZUH_WORKER_ACTOR_USER_ID."
    );
  }
  return user.id;
}

async function main() {
  if (!serverEnv.WAZUH_ENABLED) {
    log("info", "WAZUH_ENABLED=false — worker exiting");
    process.exit(0);
  }
  if (!serverEnv.WAZUH_AUTO_SYNC_ENABLED) {
    log(
      "info",
      "WAZUH_AUTO_SYNC_ENABLED=false — worker idle exit (manual sync remains available). Set WAZUH_AUTO_SYNC_ENABLED=true in .env, then re-run: npm run wazuh:worker"
    );
    process.exit(0);
  }

  const organizationId = serverEnv.WAZUH_ORGANIZATION_ID;
  if (!organizationId) {
    log("error", "WAZUH_ORGANIZATION_ID is required");
    process.exit(1);
  }

  const workerId =
    serverEnv.WAZUH_WORKER_ID?.trim() ||
    `wazuh-worker-${randomUUID().slice(0, 8)}`;
  const intervalMs = serverEnv.WAZUH_SYNC_INTERVAL_SECONDS * 1000;
  const actorId = await resolveActorId(organizationId);

  log("info", "Wazuh sync worker starting", {
    workerId,
    organizationId,
    intervalSeconds: serverEnv.WAZUH_SYNC_INTERVAL_SECONDS,
  });

  let stopping = false;
  const shutdown = () => {
    stopping = true;
    log("info", "Shutdown signal received");
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (!stopping) {
    try {
      await touchWazuhWorkerHeartbeat({ organizationId, workerId });
      const result = await syncWazuhNewEventsFromCheckpoint({
        organizationId,
        actorId,
        lockedBy: `worker:${workerId}`,
      });
      log("info", "Sync completed", {
        processed: result.processed,
        created: result.created,
        updated: result.updated,
        filtered: result.filtered,
        ignored: result.ignored,
        skippedDuplicates: result.skippedDuplicates,
        errors: result.errors,
        durationMs: result.durationMs,
      });

      // Outside checkpoint / lock lifecycle: investigation hooks must never break sync.
      try {
        await runPostIngestionInvestigationHooks(organizationId, {
          createdEventIds: result.createdSecurityEventIds ?? [],
        });
      } catch (hookError) {
        log("warn", "Post-ingestion investigation hooks failed (isolated)", {
          error:
            hookError instanceof Error
              ? hookError.message.slice(0, 300)
              : "unknown",
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown worker error";
      // Never log credentials; message is already sanitized upstream when stored.
      log("error", "Sync attempt failed", {
        error: message.slice(0, 300),
      });
    }

    // Heartbeat between syncs
    const wake = Date.now() + intervalMs;
    while (!stopping && Date.now() < wake) {
      await touchWazuhWorkerHeartbeat({ organizationId, workerId }).catch(
        () => {}
      );
      await new Promise((r) => setTimeout(r, Math.min(15_000, wake - Date.now())));
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
