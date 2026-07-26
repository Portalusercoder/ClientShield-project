import { prisma } from "@/lib/db";
import { OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import { ACTIVE_INVESTIGATION_STATUSES } from "@/services/investigations/status-transitions";
import { calculateIncidentSla } from "@/services/incidents/sla";
import { evaluateIncidentSla } from "@/services/sla/sla-calculator.service";
import { loadActiveSnapshotsForIncidents } from "@/services/sla/sla-snapshot.service";
import {
  durationStats,
  positiveDiffMs,
} from "@/services/analytics/shared";
import type {
  AnalystAnalytics,
  AnalystPerformanceRow,
} from "@/types/analytics";

/**
 * Analyst performance leaderboard from assignee fields + existing SLA evaluator.
 */
export async function getAnalystAnalytics(input: {
  organizationId: string;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<AnalystAnalytics> {
  const { organizationId, rangeStart, rangeEnd } = input;

  const users = await prisma.user.findMany({
    where: {
      organizationId,
      role: { in: ["OWNER", "ADMIN", "ANALYST"] },
      disabledAt: null,
    },
    select: { id: true, name: true, email: true },
    take: 100,
  });

  if (users.length === 0) {
    return { leaderboard: [] };
  }

  const userIds = users.map((u) => u.id);

  const [
    openIncidents,
    openInvestigations,
    completedIncidents,
    completedInvestigations,
  ] = await Promise.all([
    prisma.incident.groupBy({
      by: ["assignedToUserId"],
      where: {
        organizationId,
        assignedToUserId: { in: userIds },
        status: { in: OPEN_INCIDENT_STATUSES },
      },
      _count: { _all: true },
    }),
    prisma.investigationGroup.groupBy({
      by: ["assignedToUserId"],
      where: {
        organizationId,
        assignedToUserId: { in: userIds },
        status: { in: ACTIVE_INVESTIGATION_STATUSES },
      },
      _count: { _all: true },
    }),
    prisma.incident.findMany({
      where: {
        organizationId,
        assignedToUserId: { in: userIds },
        status: { in: ["RESOLVED", "CLOSED"] },
        resolvedAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: {
        id: true,
        assignedToUserId: true,
        detectedAt: true,
        acknowledgedAt: true,
        containedAt: true,
        resolvedAt: true,
        severity: true,
      },
      take: 3000,
    }),
    prisma.investigationGroup.findMany({
      where: {
        organizationId,
        assignedToUserId: { in: userIds },
        status: { in: ["RESOLVED", "CLOSED", "DISMISSED"] },
        OR: [
          { closedAt: { gte: rangeStart, lte: rangeEnd } },
          {
            closedAt: null,
            updatedAt: { gte: rangeStart, lte: rangeEnd },
          },
        ],
      },
      select: {
        assignedToUserId: true,
        createdAt: true,
        closedAt: true,
        updatedAt: true,
      },
      take: 3000,
    }),
  ]);

  const openIncMap = new Map(
    openIncidents.map((r) => [r.assignedToUserId!, r._count._all])
  );
  const openInvMap = new Map(
    openInvestigations.map((r) => [r.assignedToUserId!, r._count._all])
  );

  const incidentIds = completedIncidents.map((i) => i.id);
  const snapshots = await loadActiveSnapshotsForIncidents({
    organizationId,
    incidentIds,
  });

  const byUser = new Map<
    string,
    {
      completedIncidents: typeof completedIncidents;
      completedInvestigations: typeof completedInvestigations;
      slaOk: number;
      slaEval: number;
    }
  >();

  for (const u of users) {
    byUser.set(u.id, {
      completedIncidents: [],
      completedInvestigations: [],
      slaOk: 0,
      slaEval: 0,
    });
  }

  for (const inc of completedIncidents) {
    if (!inc.assignedToUserId) continue;
    const bucket = byUser.get(inc.assignedToUserId);
    if (!bucket) continue;
    bucket.completedIncidents.push(inc);
    if (inc.severity === "CRITICAL" || inc.severity === "HIGH") {
      const evaluation = evaluateIncidentSla({
        snapshot: snapshots.get(inc.id) ?? null,
        clocks: {
          detectedAt: inc.detectedAt,
          acknowledgedAt: inc.acknowledgedAt,
          containedAt: inc.containedAt,
          resolvedAt: inc.resolvedAt,
        },
        now: inc.resolvedAt ?? new Date(),
      });
      if (evaluation.overallState !== "NO_POLICY") {
        bucket.slaEval += 1;
        if (evaluation.overallState !== "BREACHED") bucket.slaOk += 1;
      }
    }
  }

  for (const inv of completedInvestigations) {
    if (!inv.assignedToUserId) continue;
    const bucket = byUser.get(inv.assignedToUserId);
    if (!bucket) continue;
    bucket.completedInvestigations.push(inv);
  }

  const leaderboard: AnalystPerformanceRow[] = users.map((u) => {
    const data = byUser.get(u.id)!;
    const resolutionSamples = data.completedIncidents
      .map((i) =>
        calculateIncidentSla({
          detectedAt: i.detectedAt,
          acknowledgedAt: null,
          containedAt: null,
          resolvedAt: i.resolvedAt,
        }).timeToResolveMs
      )
      .filter((v): v is number => v != null);
    const invDurations = data.completedInvestigations
      .map((i) =>
        positiveDiffMs(i.createdAt, i.closedAt ?? i.updatedAt)
      )
      .filter((v): v is number => v != null);

    return {
      userId: u.id,
      name: u.name?.trim() || u.email,
      openWorkload:
        (openIncMap.get(u.id) ?? 0) + (openInvMap.get(u.id) ?? 0),
      completedInvestigations: data.completedInvestigations.length,
      completedIncidents: data.completedIncidents.length,
      averageResolutionTimeMs: durationStats(resolutionSamples).meanMs,
      averageInvestigationDurationMs: durationStats(invDurations).meanMs,
      slaCompliancePct:
        data.slaEval === 0
          ? null
          : Math.round((data.slaOk / data.slaEval) * 1000) / 10,
    };
  });

  leaderboard.sort((a, b) => {
    const aDone = a.completedIncidents + a.completedInvestigations;
    const bDone = b.completedIncidents + b.completedInvestigations;
    return bDone - aDone || a.openWorkload - b.openWorkload;
  });

  return { leaderboard: leaderboard.slice(0, 20) };
}
