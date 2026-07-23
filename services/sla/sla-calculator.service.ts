/**
 * Pure Incident SLA calculator.
 * Uses frozen snapshot targets — never current live policy for historical obligations.
 */
import type {
  IncidentSlaEvaluation,
  SlaMetric,
  SlaMetricResult,
  SlaState,
} from "@/types/sla";
import type { IncidentSeverity, SlaSnapshotSource } from "@prisma/client";

export type SnapshotInput = {
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
};

export type IncidentClockInput = {
  detectedAt: Date;
  acknowledgedAt: Date | null;
  containedAt: Date | null;
  resolvedAt: Date | null;
};

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / 60_000);
}

function evaluateMetric(input: {
  metric: SlaMetric;
  targetMinutes: number | null;
  start: Date;
  completedAt: Date | null;
  now: Date;
  approachingThresholdPct: number;
}): SlaMetricResult {
  const { metric, targetMinutes, start, completedAt, now, approachingThresholdPct } =
    input;

  if (targetMinutes == null || targetMinutes <= 0) {
    return {
      metric,
      state: "NO_POLICY",
      targetMinutes: null,
      elapsedMinutes: null,
      remainingMinutes: null,
      dueAt: null,
      completedAt,
      isCompleted: completedAt != null,
    };
  }

  const dueAt = new Date(start.getTime() + targetMinutes * 60_000);
  const end = completedAt ?? now;
  const elapsedMinutes = minutesBetween(start, end);
  const remainingMinutes = completedAt
    ? Math.max(0, targetMinutes - elapsedMinutes)
    : Math.max(0, (dueAt.getTime() - now.getTime()) / 60_000);
  const approachAt = (approachingThresholdPct / 100) * targetMinutes;

  if (completedAt) {
    const state: SlaState =
      elapsedMinutes <= targetMinutes ? "MET" : "BREACHED";
    return {
      metric,
      state,
      targetMinutes,
      elapsedMinutes,
      remainingMinutes,
      dueAt,
      completedAt,
      isCompleted: true,
    };
  }

  let state: SlaState;
  if (elapsedMinutes > targetMinutes) {
    state = "BREACHED";
  } else if (elapsedMinutes >= approachAt) {
    state = "APPROACHING";
  } else {
    state = "ON_TRACK";
  }

  return {
    metric,
    state,
    targetMinutes,
    elapsedMinutes,
    remainingMinutes,
    dueAt,
    completedAt: null,
    isCompleted: false,
  };
}

function rollupState(metrics: SlaMetricResult[]): SlaState {
  const configured = metrics.filter((m) => m.state !== "NO_POLICY");
  if (configured.length === 0) return "NO_POLICY";
  if (configured.some((m) => m.state === "BREACHED")) return "BREACHED";
  if (configured.some((m) => m.state === "APPROACHING")) return "APPROACHING";
  if (configured.some((m) => m.state === "ON_TRACK")) return "ON_TRACK";
  if (configured.every((m) => m.state === "MET")) return "MET";
  return "NO_POLICY";
}

function reasonFor(metric: SlaMetricResult): string | null {
  if (metric.state === "APPROACHING") return `${metric.metric} approaching`;
  if (metric.state === "BREACHED") return `${metric.metric} breached`;
  return null;
}

/**
 * Evaluate contractual SLA for an incident against its active snapshot.
 * No snapshot → NO_POLICY (never invent breach).
 */
export function evaluateIncidentSla(input: {
  snapshot: SnapshotInput | null;
  clocks: IncidentClockInput;
  now?: Date;
}): IncidentSlaEvaluation {
  const now = input.now ?? new Date();
  if (!input.snapshot) {
    return {
      overallState: "NO_POLICY",
      metrics: [],
      reasons: [],
      snapshot: null,
    };
  }

  const snap = input.snapshot;
  const pct = snap.approachingThresholdPct;
  const metrics: SlaMetricResult[] = [
    evaluateMetric({
      metric: "MTTA",
      targetMinutes: snap.mttaMinutes,
      start: input.clocks.detectedAt,
      completedAt: input.clocks.acknowledgedAt,
      now,
      approachingThresholdPct: pct,
    }),
    evaluateMetric({
      metric: "MTTC",
      targetMinutes: snap.mttcMinutes,
      start: input.clocks.detectedAt,
      completedAt: input.clocks.containedAt,
      now,
      approachingThresholdPct: pct,
    }),
    evaluateMetric({
      metric: "MTTR",
      targetMinutes: snap.mttrMinutes,
      start: input.clocks.detectedAt,
      completedAt: input.clocks.resolvedAt,
      now,
      approachingThresholdPct: pct,
    }),
  ];

  const reasons = metrics
    .map(reasonFor)
    .filter((r): r is string => Boolean(r));

  return {
    overallState: rollupState(metrics),
    metrics,
    reasons,
    snapshot: {
      id: snap.id,
      generation: snap.generation,
      policyId: snap.policyId,
      clientIdAtSnapshot: snap.clientIdAtSnapshot,
      severityAtSnapshot: snap.severityAtSnapshot,
      mttaMinutes: snap.mttaMinutes,
      mttcMinutes: snap.mttcMinutes,
      mttrMinutes: snap.mttrMinutes,
      approachingThresholdPct: snap.approachingThresholdPct,
      snapshotSource: snap.snapshotSource,
      snappedAt: snap.snappedAt,
    },
  };
}

/** Worst active incomplete metric for AttentionItem.slaMetric */
export function primaryActiveSlaMetric(
  evaluation: IncidentSlaEvaluation
): SlaMetricResult | null {
  const order: SlaState[] = ["BREACHED", "APPROACHING", "ON_TRACK"];
  for (const state of order) {
    const hit = evaluation.metrics.find(
      (m) => m.state === state && m.targetMinutes != null
    );
    if (hit) return hit;
  }
  return null;
}
