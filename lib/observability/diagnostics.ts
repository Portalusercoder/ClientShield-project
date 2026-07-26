/**
 * Diagnostics helpers (Phase 6P2) — no secrets.
 */
import { getObservabilityConfigSummary } from "./config";
import { metrics } from "./metrics";

const PROCESS_STARTED_AT = Date.now();

export interface DiagnosticsSnapshot {
  version: string;
  gitSha: string;
  buildTime: string | null;
  environment: string;
  nodeVersion: string;
  uptimeSeconds: number;
  workers: {
    wazuhWorkerVersion: string;
    slaWorkerVersion: string;
  };
  observability: Record<string, unknown>;
  metrics: Record<string, number>;
}

export function getDiagnosticsSnapshot(): DiagnosticsSnapshot {
  const version =
    process.env.BUILD_VERSION?.trim() ||
    process.env.npm_package_version?.trim() ||
    "0.1.0";
  const gitSha = process.env.GIT_SHA?.trim() || "unknown";
  const buildTime = process.env.BUILD_TIME?.trim() || null;

  return {
    version,
    gitSha,
    buildTime,
    environment: process.env.NODE_ENV || "development",
    nodeVersion: process.version,
    uptimeSeconds: Math.floor((Date.now() - PROCESS_STARTED_AT) / 1000),
    workers: {
      wazuhWorkerVersion: version,
      slaWorkerVersion: version,
    },
    observability: getObservabilityConfigSummary(),
    metrics: metrics.snapshot(),
  };
}

/** Loaded configuration summary for operators — never includes secrets. */
export function getLoadedConfigSummary(): Record<string, unknown> {
  return {
    nodeEnv: process.env.NODE_ENV ?? null,
    authProvider: process.env.AUTH_PROVIDER ?? null,
    wazuhEnabled: process.env.WAZUH_ENABLED === "true",
    wazuhAutoSync: process.env.WAZUH_AUTO_SYNC_ENABLED === "true",
    slaEscalationEnabled: process.env.SLA_ESCALATION_ENABLED === "true",
    threatIntelEnabled: process.env.THREAT_INTEL_ENABLED === "true",
    investigationCorrelationEnabled:
      process.env.INVESTIGATION_CORRELATION_ENABLED !== "false",
    publicAppUrlConfigured: Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim()),
    observability: getObservabilityConfigSummary(),
    security: {
      enableHsts: process.env.ENABLE_HSTS ?? "(default)",
      enableCsp: process.env.ENABLE_CSP ?? "(default)",
      cspReportOnly: process.env.CSP_REPORT_ONLY ?? "(default)",
      enableRateLimiting: process.env.ENABLE_RATE_LIMITING ?? "(default)",
    },
  };
}
