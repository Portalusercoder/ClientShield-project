/**
 * Observability configuration (Phase 6P2).
 * Safe production defaults. Reads process.env directly to avoid circular imports.
 */
import type { LogFormat, LogLevel } from "./types";

const LEVEL_RANK: Record<LogLevel, number> = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  FATAL: 60,
};

function parseBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw === "") return defaultValue;
  return raw === "true" || raw === "1";
}

function parseLogLevel(raw: string | undefined): LogLevel {
  const v = (raw ?? "").trim().toUpperCase();
  if (v in LEVEL_RANK) return v as LogLevel;
  if (parseBool(process.env.ENABLE_DEBUG_LOGS, false)) return "DEBUG";
  return "INFO";
}

function parseLogFormat(raw: string | undefined): LogFormat {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "pretty") return "pretty";
  return "json";
}

export interface ObservabilityConfig {
  logLevel: LogLevel;
  logFormat: LogFormat;
  enableDebugLogs: boolean;
  enableRequestLogging: boolean;
  enableMetrics: boolean;
  slowQueryMs: number;
}

let cached: ObservabilityConfig | null = null;

export function getObservabilityConfig(): ObservabilityConfig {
  if (cached) return cached;
  const enableDebugLogs = parseBool(process.env.ENABLE_DEBUG_LOGS, false);
  cached = {
    logLevel: parseLogLevel(process.env.LOG_LEVEL),
    logFormat: parseLogFormat(process.env.LOG_FORMAT),
    enableDebugLogs,
    enableRequestLogging: parseBool(
      process.env.ENABLE_REQUEST_LOGGING,
      process.env.NODE_ENV !== "production"
    ),
    enableMetrics: parseBool(process.env.ENABLE_METRICS, true),
    slowQueryMs: Math.max(
      50,
      Number.parseInt(process.env.SLOW_QUERY_MS ?? "500", 10) || 500
    ),
  };
  return cached;
}

/** Test helper — clear cached config after env changes. */
export function resetObservabilityConfigCache(): void {
  cached = null;
}

export function levelRank(level: LogLevel): number {
  return LEVEL_RANK[level];
}

export function shouldLog(level: LogLevel): boolean {
  return levelRank(level) >= levelRank(getObservabilityConfig().logLevel);
}

/** Safe config summary — no secrets. */
export function getObservabilityConfigSummary(): Record<string, unknown> {
  const cfg = getObservabilityConfig();
  return {
    logLevel: cfg.logLevel,
    logFormat: cfg.logFormat,
    enableDebugLogs: cfg.enableDebugLogs,
    enableRequestLogging: cfg.enableRequestLogging,
    enableMetrics: cfg.enableMetrics,
    slowQueryMs: cfg.slowQueryMs,
  };
}
