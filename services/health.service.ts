/**
 * Production health checks (Phase 6P1 + 6P2 observability).
 * No secrets. Safe for load balancers / nginx.
 */
import { prisma } from "@/lib/db";
import {
  getDiagnosticsSnapshot,
  logger,
  startTimer,
} from "@/lib/observability";

export type HealthStatus = "ok" | "degraded" | "error";

export type WorkerHeartbeatStatus =
  | "ok"
  | "stale"
  | "idle"
  | "unknown"
  | "disabled";

export interface HealthCheckResult {
  status: HealthStatus;
  version: string;
  gitSha: string;
  buildTime: string | null;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    application: { status: "ok" };
    database: { status: HealthStatus; latencyMs?: number; error?: string };
    prisma: { status: HealthStatus; error?: string };
    workers: {
      wazuh: {
        status: WorkerHeartbeatStatus;
        lastHeartbeatAt: string | null;
        workerId: string | null;
        note?: string;
      };
      slaEscalation: {
        status: WorkerHeartbeatStatus;
        lastHeartbeatAt: string | null;
        lockedBy: string | null;
        note?: string;
      };
    };
  };
  /** Safe diagnostics subset — no secrets */
  diagnostics?: {
    nodeVersion: string;
    observability: Record<string, unknown>;
    metrics: Record<string, number>;
  };
}

const STARTED_AT = Date.now();

/** Heartbeats older than this are stale (workers default interval 60s). */
const HEARTBEAT_STALE_MS = 5 * 60 * 1000;

function envFlag(name: string): boolean {
  return process.env[name] === "true";
}

function classifyHeartbeat(
  lastHeartbeatAt: Date | null | undefined,
  enabled: boolean
): WorkerHeartbeatStatus {
  if (!enabled) return "disabled";
  if (!lastHeartbeatAt) return "unknown";
  const age = Date.now() - lastHeartbeatAt.getTime();
  if (age > HEARTBEAT_STALE_MS) return "stale";
  return "ok";
}

export async function getHealthCheckResult(): Promise<HealthCheckResult> {
  const timer = startTimer();
  logger.debug("health.check.start", {
    service: "health",
    action: "getHealthCheckResult",
  });

  const diagnostics = getDiagnosticsSnapshot();
  const version = diagnostics.version;
  const gitSha = diagnostics.gitSha;
  const environment = diagnostics.environment;

  let dbStatus: HealthStatus = "ok";
  let dbLatencyMs: number | undefined;
  let dbError: string | undefined;
  let prismaStatus: HealthStatus = "ok";
  let prismaError: string | undefined;

  const dbStarted = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStarted;
  } catch (e) {
    dbStatus = "error";
    prismaStatus = "error";
    dbError = "database_unreachable";
    prismaError = e instanceof Error ? e.message.slice(0, 120) : "query_failed";
  }

  let wazuhHb: Date | null = null;
  let wazuhWorkerId: string | null = null;
  let slaHb: Date | null = null;
  let slaLockedBy: string | null = null;

  if (dbStatus === "ok") {
    try {
      const [wazuhState, slaState] = await Promise.all([
        prisma.wazuhIngestionState.findFirst({
          orderBy: { workerLastHeartbeatAt: "desc" },
          select: {
            workerLastHeartbeatAt: true,
            workerId: true,
          },
        }),
        prisma.slaEscalationWorkerState.findUnique({
          where: { id: "global" },
          select: {
            lastHeartbeatAt: true,
            lockedBy: true,
          },
        }),
      ]);
      wazuhHb = wazuhState?.workerLastHeartbeatAt ?? null;
      wazuhWorkerId = wazuhState?.workerId ?? null;
      slaHb = slaState?.lastHeartbeatAt ?? null;
      slaLockedBy = slaState?.lockedBy ?? null;
    } catch {
      // Heartbeat metadata is best-effort; do not fail the whole probe.
    }
  }

  const wazuhEnabled =
    envFlag("WAZUH_ENABLED") && envFlag("WAZUH_AUTO_SYNC_ENABLED");
  const slaEnabled = envFlag("SLA_ESCALATION_ENABLED");

  const wazuhStatus = classifyHeartbeat(wazuhHb, wazuhEnabled);
  const slaStatus = classifyHeartbeat(slaHb, slaEnabled);

  let status: HealthStatus = "ok";
  if (dbStatus === "error" || prismaStatus === "error") {
    status = "error";
  } else if (
    (wazuhEnabled && (wazuhStatus === "stale" || wazuhStatus === "unknown")) ||
    (slaEnabled && (slaStatus === "stale" || slaStatus === "unknown"))
  ) {
    status = "degraded";
  }

  const result: HealthCheckResult = {
    status,
    version,
    gitSha,
    buildTime: diagnostics.buildTime,
    environment,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    checks: {
      application: { status: "ok" },
      database: {
        status: dbStatus,
        ...(dbLatencyMs != null ? { latencyMs: dbLatencyMs } : {}),
        ...(dbError ? { error: dbError } : {}),
      },
      prisma: {
        status: prismaStatus,
        ...(prismaError ? { error: prismaError } : {}),
      },
      workers: {
        wazuh: {
          status: wazuhStatus,
          lastHeartbeatAt: wazuhHb?.toISOString() ?? null,
          workerId: wazuhWorkerId,
          ...(wazuhEnabled
            ? {}
            : {
                note: "WAZUH_ENABLED/WAZUH_AUTO_SYNC_ENABLED not both true",
              }),
        },
        slaEscalation: {
          status: slaStatus,
          lastHeartbeatAt: slaHb?.toISOString() ?? null,
          lockedBy: slaLockedBy,
          ...(slaEnabled
            ? {}
            : { note: "SLA_ESCALATION_ENABLED is not true" }),
        },
      },
    },
    diagnostics: {
      nodeVersion: diagnostics.nodeVersion,
      observability: diagnostics.observability,
      metrics: diagnostics.metrics,
    },
  };

  logger.info("health.check.finish", {
    service: "health",
    action: "getHealthCheckResult",
    status: result.status,
    durationMs: timer.elapsedMs(),
    dbLatencyMs,
  });

  return result;
}
