/**
 * Incident contractual SLA types (MVP: HIGH/CRITICAL incidents only).
 * Finding dueDate remains OVERDUE — never labeled SLA without a real policy.
 */
import type { IncidentSeverity, SlaSnapshotSource } from "@prisma/client";

export const SLA_MVP_SEVERITIES = ["CRITICAL", "HIGH"] as const;
export type SlaMvpSeverity = (typeof SLA_MVP_SEVERITIES)[number];

export const SLA_MAX_MINUTES = 525_600; // 365 days
export const SLA_DEFAULT_APPROACHING_PCT = 80;

export type SlaMetric = "MTTA" | "MTTC" | "MTTR";

export type SlaState =
  | "NO_POLICY"
  | "ON_TRACK"
  | "APPROACHING"
  | "BREACHED"
  | "MET";

export type AttentionSlaFilter =
  | "ALL"
  | "ON_TRACK"
  | "APPROACHING"
  | "BREACHED";

export interface SlaPolicyInput {
  clientId?: string | null;
  severity: SlaMvpSeverity;
  mttaMinutes?: number | null;
  mttcMinutes?: number | null;
  mttrMinutes?: number | null;
  approachingThresholdPct?: number;
  enabled?: boolean;
}

export interface SlaPolicyRecord {
  id: string;
  organizationId: string;
  clientId: string | null;
  clientName: string | null;
  severity: IncidentSeverity;
  mttaMinutes: number | null;
  mttcMinutes: number | null;
  mttrMinutes: number | null;
  approachingThresholdPct: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResolvedSlaPolicy {
  policyId: string;
  organizationId: string;
  clientId: string | null;
  severity: IncidentSeverity;
  mttaMinutes: number | null;
  mttcMinutes: number | null;
  mttrMinutes: number | null;
  approachingThresholdPct: number;
  snapshotSource: SlaSnapshotSource;
}

export interface SlaMetricResult {
  metric: SlaMetric;
  state: SlaState;
  targetMinutes: number | null;
  elapsedMinutes: number | null;
  remainingMinutes: number | null;
  dueAt: Date | null;
  completedAt: Date | null;
  isCompleted: boolean;
}

export interface IncidentSlaEvaluation {
  overallState: SlaState;
  metrics: SlaMetricResult[];
  reasons: string[];
  snapshot: {
    id: string;
    generation: number;
    policyId: string | null;
    clientIdAtSnapshot: string | null;
    severityAtSnapshot: IncidentSeverity;
    mttaMinutes: number | null;
    mttcMinutes: number | null;
    mttrMinutes: number | null;
    approachingThresholdPct: number;
    snapshotSource: SlaSnapshotSource;
    snappedAt: Date;
  } | null;
}

export function isSlaMvpSeverity(
  severity: string
): severity is SlaMvpSeverity {
  return (SLA_MVP_SEVERITIES as readonly string[]).includes(severity);
}
