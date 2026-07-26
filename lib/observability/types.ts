/**
 * Observability types (Phase 6P2).
 */

export type LogLevel =
  | "TRACE"
  | "DEBUG"
  | "INFO"
  | "WARN"
  | "ERROR"
  | "FATAL";

export type LogFormat = "json" | "pretty";

export interface ObservabilityContext {
  requestId: string;
  correlationId: string;
  organizationId?: string;
  userId?: string;
  service?: string;
  action?: string;
  /** Workflow entity ids for end-to-end tracing */
  securityEventId?: string;
  investigationId?: string;
  findingId?: string;
  incidentId?: string;
  workerId?: string;
  /** Extra safe meta merged into logs */
  meta?: Record<string, unknown>;
}

export interface LogFields {
  timestamp: string;
  level: LogLevel;
  service: string;
  action?: string;
  message: string;
  requestId?: string;
  correlationId?: string;
  organizationId?: string;
  userId?: string;
  durationMs?: number;
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };
  [key: string]: unknown;
}

export type MetricName =
  | "requests"
  | "errors"
  | "worker_runs"
  | "worker_failures"
  | "wazuh_syncs"
  | "notifications_produced"
  | "investigations_created"
  | "findings_created"
  | "incidents_created";
