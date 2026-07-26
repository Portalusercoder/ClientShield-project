import { prisma } from "@/lib/db";
import { OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import { getIncidentCaseMetrics } from "@/services/incidents/queries";
import { evaluateIncidentSla } from "@/services/sla/sla-calculator.service";
import { loadActiveSnapshotsForIncidents } from "@/services/sla/sla-snapshot.service";
import {
  buildEmptySeries,
  dayKey,
  fillSeries,
  weekKey,
} from "@/services/analytics/shared";
import type {
  AnalyticsRangeDays,
  AnalyticsSeriesPoint,
  SlaAnalytics,
} from "@/types/analytics";

const BREACH_TRIGGERS = [
  "MTTA_BREACHED",
  "MTTC_BREACHED",
  "MTTR_BREACHED",
] as const;

export async function getSlaAnalytics(input: {
  organizationId: string;
  rangeDays: AnalyticsRangeDays;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<SlaAnalytics> {
  const { organizationId, rangeDays, rangeStart, rangeEnd } = input;
  const empty = buildEmptySeries(rangeStart, rangeEnd, rangeDays);
  const now = new Date();

  const [openIncidents, caseMetrics, breachEvents, resolvedWithClocks] =
    await Promise.all([
      prisma.incident.findMany({
        where: {
          organizationId,
          status: { in: OPEN_INCIDENT_STATUSES },
          severity: { in: ["CRITICAL", "HIGH"] },
        },
        select: {
          id: true,
          detectedAt: true,
          acknowledgedAt: true,
          containedAt: true,
          resolvedAt: true,
        },
        take: 1000,
      }),
      getIncidentCaseMetrics(organizationId),
      prisma.escalationEvent.findMany({
        where: {
          organizationId,
          triggerType: { in: [...BREACH_TRIGGERS] },
          firedAt: { gte: rangeStart, lte: rangeEnd },
        },
        select: { firedAt: true },
        take: 5000,
      }),
      prisma.incident.findMany({
        where: {
          organizationId,
          severity: { in: ["CRITICAL", "HIGH"] },
          status: { in: ["RESOLVED", "CLOSED"] },
          resolvedAt: { gte: rangeStart, lte: rangeEnd },
        },
        select: {
          id: true,
          detectedAt: true,
          acknowledgedAt: true,
          containedAt: true,
          resolvedAt: true,
        },
        take: 2000,
      }),
    ]);

  const openSnapshots = await loadActiveSnapshotsForIncidents({
    organizationId,
    incidentIds: openIncidents.map((i) => i.id),
  });

  let breachedOpen = 0;
  let atRiskOpen = 0;
  let evaluatedOpen = 0;
  let withinSla = 0;

  for (const incident of openIncidents) {
    const evaluation = evaluateIncidentSla({
      snapshot: openSnapshots.get(incident.id) ?? null,
      clocks: {
        detectedAt: incident.detectedAt,
        acknowledgedAt: incident.acknowledgedAt,
        containedAt: incident.containedAt,
        resolvedAt: incident.resolvedAt,
      },
      now,
    });
    if (
      evaluation.overallState === "NO_POLICY" ||
      evaluation.overallState === "MET"
    ) {
      continue;
    }
    evaluatedOpen += 1;
    if (evaluation.overallState === "BREACHED") breachedOpen += 1;
    else if (evaluation.overallState === "APPROACHING") atRiskOpen += 1;
    else if (evaluation.overallState === "ON_TRACK") withinSla += 1;
  }

  const currentCompliancePct =
    evaluatedOpen === 0
      ? null
      : Math.round((withinSla / evaluatedOpen) * 1000) / 10;

  // Compliance trend: daily/weekly share of open HIGH/CRITICAL that were ON_TRACK
  // Approximate using breach events inverted is weak; instead sample resolved outcomes.
  const resolvedSnapshots = await loadActiveSnapshotsForIncidents({
    organizationId,
    incidentIds: resolvedWithClocks.map((i) => i.id),
  });

  const keyFn = rangeDays === 90 ? weekKey : dayKey;
  const resolvedByBucket = new Map<string, { ok: number; total: number }>();
  let resolvedBeforeBreach = 0;
  let resolvedEvaluated = 0;

  for (const incident of resolvedWithClocks) {
    if (!incident.resolvedAt) continue;
    const evaluation = evaluateIncidentSla({
      snapshot: resolvedSnapshots.get(incident.id) ?? null,
      clocks: {
        detectedAt: incident.detectedAt,
        acknowledgedAt: incident.acknowledgedAt,
        containedAt: incident.containedAt,
        resolvedAt: incident.resolvedAt,
      },
      now: incident.resolvedAt,
    });
    if (evaluation.overallState === "NO_POLICY") continue;
    resolvedEvaluated += 1;
    const beforeBreach =
      evaluation.overallState === "MET" ||
      evaluation.overallState === "ON_TRACK" ||
      evaluation.overallState === "APPROACHING";
    // MET = completed within target; BREACHED = late
    const met =
      evaluation.overallState === "MET" ||
      (evaluation.overallState !== "BREACHED" && beforeBreach);
    // Prefer: not BREACHED at resolve time
    const ok = evaluation.overallState !== "BREACHED";
    if (ok) resolvedBeforeBreach += 1;

    const k = keyFn(incident.resolvedAt);
    const entry = resolvedByBucket.get(k) ?? { ok: 0, total: 0 };
    entry.total += 1;
    if (ok) entry.ok += 1;
    resolvedByBucket.set(k, entry);
    void met;
  }

  const complianceTrend: AnalyticsSeriesPoint[] = empty.map((p) => {
    const entry = resolvedByBucket.get(p.bucket);
    if (!entry || entry.total === 0) {
      return { ...p, value: 0 };
    }
    return {
      ...p,
      value: Math.round((entry.ok / entry.total) * 1000) / 10,
    };
  });

  return {
    complianceTrend,
    breachTrend: fillSeries(
      empty,
      breachEvents.map((e) => e.firedAt),
      rangeDays
    ),
    averageResponseTimeMs: caseMetrics.meanTimeToAcknowledgeMs,
    averageResolutionTimeMs: caseMetrics.meanTimeToResolveMs,
    escalationFrequency: breachEvents.length,
    resolutionBeforeBreachPct:
      resolvedEvaluated === 0
        ? null
        : Math.round((resolvedBeforeBreach / resolvedEvaluated) * 1000) / 10,
    currentCompliancePct,
    breachedOpen,
    atRiskOpen,
  };
}
