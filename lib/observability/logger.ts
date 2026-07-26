/**
 * Central structured logger (Phase 6P2).
 * Never logs secrets — payloads are redacted.
 */
import {
  getObservabilityConfig,
  shouldLog,
} from "./config";
import { getObservabilityContext } from "./context";
import { redactObject } from "./redact";
import type { LogFields, LogLevel } from "./types";

function emit(level: LogLevel, fields: LogFields): void {
  if (!shouldLog(level)) return;

  const cfg = getObservabilityConfig();
  const payload = redactObject(fields as Record<string, unknown>);

  if (cfg.logFormat === "pretty") {
    const { timestamp, level: lvl, message, ...rest } = payload;
    const line = `${timestamp} ${lvl} ${message}`;
    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
    write(level, line + extra);
    return;
  }

  write(level, JSON.stringify(payload));
}

function write(level: LogLevel, line: string): void {
  if (level === "ERROR" || level === "FATAL") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function buildFields(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): LogFields {
  const ctx = getObservabilityContext();
  const service =
    (meta?.service as string | undefined) ??
    ctx?.service ??
    "clientshield";
  const action =
    (meta?.action as string | undefined) ?? ctx?.action;

  const { service: _s, action: _a, err, error, ...rest } = meta ?? {};
  void _s;
  void _a;

  const errObj = (err ?? error) as
    | Error
    | { name?: string; message?: string; code?: string; stack?: string }
    | undefined;

  const fields: LogFields = {
    timestamp: new Date().toISOString(),
    level,
    service,
    message,
    ...(action ? { action } : {}),
    ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
    ...(ctx?.correlationId ? { correlationId: ctx.correlationId } : {}),
    ...(ctx?.organizationId ? { organizationId: ctx.organizationId } : {}),
    ...(ctx?.userId ? { userId: ctx.userId } : {}),
    ...(ctx?.securityEventId
      ? { securityEventId: ctx.securityEventId }
      : {}),
    ...(ctx?.investigationId
      ? { investigationId: ctx.investigationId }
      : {}),
    ...(ctx?.findingId ? { findingId: ctx.findingId } : {}),
    ...(ctx?.incidentId ? { incidentId: ctx.incidentId } : {}),
    ...(ctx?.workerId ? { workerId: ctx.workerId } : {}),
    ...rest,
  };

  if (errObj) {
    fields.error = {
      name: errObj.name ?? "Error",
      message: String(errObj.message ?? "unknown").slice(0, 500),
      ...(typeof (errObj as { code?: string }).code === "string"
        ? { code: (errObj as { code?: string }).code }
        : {}),
      ...(process.env.NODE_ENV !== "production" && errObj.stack
        ? { stack: String(errObj.stack).slice(0, 4000) }
        : process.env.NODE_ENV === "production" && errObj.stack
          ? { stack: String(errObj.stack).slice(0, 2000) }
          : {}),
    };
  }

  return fields;
}

function log(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  emit(level, buildFields(level, message, meta));
}

export const logger = {
  trace: (message: string, meta?: Record<string, unknown>) =>
    log("TRACE", message, meta),
  debug: (message: string, meta?: Record<string, unknown>) =>
    log("DEBUG", message, meta),
  info: (message: string, meta?: Record<string, unknown>) =>
    log("INFO", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) =>
    log("WARN", message, meta),
  error: (message: string, meta?: Record<string, unknown>) =>
    log("ERROR", message, meta),
  fatal: (message: string, meta?: Record<string, unknown>) =>
    log("FATAL", message, meta),
  child(defaultMeta: Record<string, unknown>) {
    return {
      trace: (message: string, meta?: Record<string, unknown>) =>
        log("TRACE", message, { ...defaultMeta, ...meta }),
      debug: (message: string, meta?: Record<string, unknown>) =>
        log("DEBUG", message, { ...defaultMeta, ...meta }),
      info: (message: string, meta?: Record<string, unknown>) =>
        log("INFO", message, { ...defaultMeta, ...meta }),
      warn: (message: string, meta?: Record<string, unknown>) =>
        log("WARN", message, { ...defaultMeta, ...meta }),
      error: (message: string, meta?: Record<string, unknown>) =>
        log("ERROR", message, { ...defaultMeta, ...meta }),
      fatal: (message: string, meta?: Record<string, unknown>) =>
        log("FATAL", message, { ...defaultMeta, ...meta }),
    };
  },
};

export type Logger = typeof logger;
