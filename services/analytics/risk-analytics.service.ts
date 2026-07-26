import { prisma } from "@/lib/db";
import { calculateExecutivePostureScore } from "@/services/dashboard/executive-posture.service";
import { OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import { ACTIVE_INVESTIGATION_STATUSES } from "@/services/investigations/status-transitions";
import { UNRESOLVED_FINDING_STATUSES } from "@/types/findings";
import { evaluateIncidentSla } from "@/services/sla/sla-calculator.service";
import { loadActiveSnapshotsForIncidents } from "@/services/sla/sla-snapshot.service";
import { ACTIVE_STATUSES } from "@/services/security-events/shared";
import {
  buildEmptySeries,
  fillSeries,
  weekKey,
} from "@/services/analytics/shared";
import type {
  AnalyticsRangeDays,
  AnalyticsSeriesPoint,
  RiskAnalytics,
} from "@/types/analytics";

async function currentPostureScore(organizationId: string): Promise<number> {
  const now = new Date();
  const [
    criticalIncidents,
    criticalFindings,
    openInvestigations,
    openSecurityEvents,
    openHighCritical,
  ] = await Promise.all([
    prisma.incident.count({
      where: {
        organizationId,
        severity: "CRITICAL",
        status: { in: OPEN_INCIDENT_STATUSES },
      },
    }),
    prisma.finding.count({
      where: {
        organizationId,
        severity: "CRITICAL",
        status: { in: UNRESOLVED_FINDING_STATUSES },
      },
    }),
    prisma.investigationGroup.count({
      where: {
        organizationId,
        status: { in: ACTIVE_INVESTIGATION_STATUSES },
      },
    }),
    prisma.securityEvent.count({
      where: {
        organizationId,
        status: { in: ACTIVE_STATUSES },
      },
    }),
    prisma.incident.findMany({
      where: {
        organizationId,
        severity: { in: ["CRITICAL", "HIGH"] },
        status: { in: OPEN_INCIDENT_STATUSES },
      },
      select: {
        id: true,
        detectedAt: true,
        acknowledgedAt: true,
        containedAt: true,
        resolvedAt: true,
      },
      take: 500,
    }),
  ]);

  const snapshots = await loadActiveSnapshotsForIncidents({
    organizationId,
    incidentIds: openHighCritical.map((i) => i.id),
  });
  let breachedSla = 0;
  for (const incident of openHighCritical) {
    const evaluation = evaluateIncidentSla({
      snapshot: snapshots.get(incident.id) ?? null,
      clocks: {
        detectedAt: incident.detectedAt,
        acknowledgedAt: incident.acknowledgedAt,
        containedAt: incident.containedAt,
        resolvedAt: incident.resolvedAt,
      },
      now,
    });
    if (evaluation.overallState === "BREACHED") breachedSla += 1;
  }

  return calculateExecutivePostureScore({
    criticalIncidents,
    criticalFindings,
    breachedSla,
    openInvestigations,
    openSecurityEvents,
  }).score;
}

export async function getRiskAnalytics(input: {
  organizationId: string;
  rangeDays: AnalyticsRangeDays;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<RiskAnalytics> {
  const { organizationId, rangeDays, rangeStart, rangeEnd } = input;
  const empty = buildEmptySeries(rangeStart, rangeEnd, rangeDays);
  const keyFn = rangeDays === 90 ? weekKey : (d: Date) =>
    d.toISOString().slice(0, 10);

  const [
    scoreSnapshots,
    clients,
    assets,
    criticalFindings,
    criticalIncidents,
    livePosture,
  ] = await Promise.all([
    prisma.securityScoreSnapshot.findMany({
      where: {
        organizationId,
        calculatedAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: {
        score: true,
        calculatedAt: true,
        clientId: true,
        assetId: true,
      },
      orderBy: { calculatedAt: "asc" },
      take: 2000,
    }),
    prisma.client.findMany({
      where: { organizationId, status: { not: "INACTIVE" } },
      select: { id: true, name: true, securityScore: true },
      orderBy: [{ securityScore: "asc" }, { name: "asc" }],
      take: 10,
    }),
    prisma.asset.findMany({
      where: { organizationId },
      select: { id: true, name: true, securityScore: true },
      orderBy: [{ securityScore: "asc" }, { name: "asc" }],
      take: 10,
    }),
    prisma.finding.findMany({
      where: {
        organizationId,
        severity: "CRITICAL",
        firstDetectedAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { firstDetectedAt: true },
      take: 5000,
    }),
    prisma.incident.findMany({
      where: {
        organizationId,
        severity: "CRITICAL",
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { createdAt: true },
      take: 5000,
    }),
    currentPostureScore(organizationId),
  ]);

  const orgSnap = scoreSnapshots.filter((s) => !s.clientId && !s.assetId);
  let postureTrend: AnalyticsSeriesPoint[];
  if (orgSnap.length > 0) {
    const lastByBucket = new Map<string, number>();
    for (const s of orgSnap) {
      lastByBucket.set(keyFn(s.calculatedAt), s.score);
    }
    let last: number | null = null;
    postureTrend = empty.map((p) => {
      if (lastByBucket.has(p.bucket)) last = lastByBucket.get(p.bucket)!;
      return { ...p, value: last ?? livePosture };
    });
  } else {
    postureTrend = empty.map((p) => ({ ...p, value: livePosture }));
  }

  const riskBuckets = new Map<string, { sum: number; n: number }>();
  for (const s of scoreSnapshots) {
    if (!s.clientId && !s.assetId) continue;
    const k = keyFn(s.calculatedAt);
    const e = riskBuckets.get(k) ?? { sum: 0, n: 0 };
    e.sum += s.score;
    e.n += 1;
    riskBuckets.set(k, e);
  }
  let lastRisk =
    clients.find((c) => c.securityScore != null)?.securityScore ?? livePosture;
  const riskScoreTrend = empty.map((p) => {
    const e = riskBuckets.get(p.bucket);
    if (e && e.n > 0) lastRisk = Math.round((e.sum / e.n) * 10) / 10;
    return { ...p, value: lastRisk ?? 0 };
  });

  return {
    postureTrend,
    riskScoreTrend,
    highestRiskClients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      securityScore: c.securityScore,
    })),
    highestRiskAssets: assets.map((a) => ({
      id: a.id,
      name: a.name,
      securityScore: a.securityScore,
    })),
    criticalFindingsSeries: fillSeries(
      empty,
      criticalFindings.map((f) => f.firstDetectedAt),
      rangeDays
    ),
    criticalIncidentsSeries: fillSeries(
      empty,
      criticalIncidents.map((i) => i.createdAt),
      rangeDays
    ),
  };
}
