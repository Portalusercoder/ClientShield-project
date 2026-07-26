/**
 * Executive Dashboard aggregation (Phase 6C2).
 * Dedicated service — does not overload SOC analyst dashboard.
 */
import { prisma } from "@/lib/db";
import { getAttentionSummary } from "@/services/attention/attention.service";
import { calculateExecutivePostureScore } from "@/services/dashboard/executive-posture.service";
import { getHealthCheckResult } from "@/services/health.service";
import { getIncidentCaseMetrics } from "@/services/incidents/queries";
import { OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import { ACTIVE_INVESTIGATION_STATUSES } from "@/services/investigations/status-transitions";
import { evaluateIncidentSla } from "@/services/sla/sla-calculator.service";
import { loadActiveSnapshotsForIncidents } from "@/services/sla/sla-snapshot.service";
import { ACTIVE_STATUSES } from "@/services/security-events/shared";
import { UNRESOLVED_FINDING_STATUSES } from "@/types/findings";
import type {
  AnalystWorkloadRow,
  ExecutiveClientOverviewRow,
  ExecutiveDashboardData,
  ExecutiveRiskDistribution,
  ExecutiveSlaCompliance,
  ExecutiveTrends,
  NamedRiskRow,
  SeverityCountRow,
  TrendPeriodCounts,
} from "@/types/executive-dashboard";

const TOP_N = 10;
const EXCLUDED_CLIENT_STATUSES = ["OFFBOARDED", "INACTIVE"] as const;

function daysAgo(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function bucketScore(score: number | null): string {
  if (score == null) return "Unassessed";
  if (score < 40) return "Critical (<40)";
  if (score < 60) return "High (40–59)";
  if (score < 75) return "Medium (60–74)";
  if (score < 90) return "Good (75–89)";
  return "Strong (90+)";
}

function tallyBuckets(
  scores: Array<number | null>
): { label: string; count: number }[] {
  const order = [
    "Critical (<40)",
    "High (40–59)",
    "Medium (60–74)",
    "Good (75–89)",
    "Strong (90+)",
    "Unassessed",
  ];
  const map = new Map(order.map((l) => [l, 0]));
  for (const s of scores) {
    const label = bucketScore(s);
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return order.map((label) => ({ label, count: map.get(label) ?? 0 }));
}

function mapSeverityGroups(
  rows: Array<{ severity: string; _count: { _all: number } | number }>
): SeverityCountRow[] {
  return rows
    .map((r) => ({
      severity: r.severity,
      count: typeof r._count === "number" ? r._count : r._count._all,
    }))
    .sort((a, b) => b.count - a.count);
}

async function countTrendPeriod(
  organizationId: string,
  since: Date
): Promise<TrendPeriodCounts> {
  const [
    incidentsCreated,
    findingsCreated,
    investigationsOpened,
    securityEventsIngested,
    incidentsResolved,
  ] = await Promise.all([
    prisma.incident.count({
      where: { organizationId, createdAt: { gte: since } },
    }),
    prisma.finding.count({
      where: { organizationId, firstDetectedAt: { gte: since } },
    }),
    prisma.investigationGroup.count({
      where: { organizationId, createdAt: { gte: since } },
    }),
    prisma.securityEvent.count({
      where: { organizationId, createdAt: { gte: since } },
    }),
    prisma.incident.count({
      where: {
        organizationId,
        status: { in: ["RESOLVED", "CLOSED"] },
        resolvedAt: { gte: since },
      },
    }),
  ]);

  return {
    incidentsCreated,
    findingsCreated,
    investigationsOpened,
    securityEventsIngested,
    incidentsResolved,
  };
}

async function buildSlaCompliance(
  organizationId: string
): Promise<ExecutiveSlaCompliance> {
  const [openIncidents, policyCount, caseMetrics] = await Promise.all([
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
    }),
    prisma.slaPolicy.count({
      where: { organizationId, enabled: true },
    }),
    getIncidentCaseMetrics(organizationId),
  ]);

  const snapshots = await loadActiveSnapshotsForIncidents({
    organizationId,
    incidentIds: openIncidents.map((i) => i.id),
  });

  const now = new Date();
  let breached = 0;
  let atRisk = 0;
  let withinSla = 0;
  let evaluated = 0;

  for (const incident of openIncidents) {
    const snapshot = snapshots.get(incident.id) ?? null;
    const evaluation = evaluateIncidentSla({
      snapshot,
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
    evaluated += 1;
    if (evaluation.overallState === "BREACHED") breached += 1;
    else if (evaluation.overallState === "APPROACHING") atRisk += 1;
    else if (evaluation.overallState === "ON_TRACK") withinSla += 1;
  }

  const compliant = withinSla;
  const compliancePercent =
    evaluated === 0
      ? null
      : Math.round(((compliant / evaluated) * 1000) / 10);

  return {
    compliancePercent,
    breached,
    atRisk,
    withinSla,
    evaluated,
    averageResponseTimeMs: caseMetrics.meanTimeToAcknowledgeMs,
    averageResolutionTimeMs: caseMetrics.meanTimeToResolveMs,
    hasSlaPolicies: policyCount > 0,
  };
}

async function buildRiskDistribution(
  organizationId: string
): Promise<ExecutiveRiskDistribution> {
  const [
    findingsBySeverity,
    incidentsBySeverity,
    securityEventsBySeverity,
    assets,
    clients,
  ] = await Promise.all([
    prisma.finding.groupBy({
      by: ["severity"],
      where: {
        organizationId,
        status: { in: UNRESOLVED_FINDING_STATUSES },
      },
      _count: { _all: true },
    }),
    prisma.incident.groupBy({
      by: ["severity"],
      where: {
        organizationId,
        status: { in: OPEN_INCIDENT_STATUSES },
      },
      _count: { _all: true },
    }),
    prisma.securityEvent.groupBy({
      by: ["severity"],
      where: {
        organizationId,
        status: { in: ACTIVE_STATUSES },
      },
      _count: { _all: true },
    }),
    prisma.asset.findMany({
      where: { organizationId },
      select: { id: true, name: true, securityScore: true },
      orderBy: [{ securityScore: "asc" }, { name: "asc" }],
      take: 500,
    }),
    prisma.client.findMany({
      where: {
        organizationId,
        status: { notIn: [...EXCLUDED_CLIENT_STATUSES] },
      },
      select: { id: true, name: true, securityScore: true },
      orderBy: [{ securityScore: "asc" }, { name: "asc" }],
      take: 500,
    }),
  ]);

  const scoredAssets = [...assets]
    .filter((a) => a.securityScore != null)
    .sort((a, b) => (a.securityScore ?? 100) - (b.securityScore ?? 100))
    .slice(0, TOP_N);
  const unscoredAssets = assets
    .filter((a) => a.securityScore == null)
    .slice(0, Math.max(0, TOP_N - scoredAssets.length));

  const highestRiskAssets: NamedRiskRow[] = [
    ...scoredAssets,
    ...unscoredAssets,
  ]
    .slice(0, TOP_N)
    .map((a) => ({
      id: a.id,
      name: a.name,
      securityScore: a.securityScore,
      href: `/assets/${a.id}`,
    }));

  const scoredClients = [...clients]
    .filter((c) => c.securityScore != null)
    .sort((a, b) => (a.securityScore ?? 100) - (b.securityScore ?? 100))
    .slice(0, TOP_N);
  const unscoredClients = clients
    .filter((c) => c.securityScore == null)
    .slice(0, Math.max(0, TOP_N - scoredClients.length));

  const highestRiskClients: NamedRiskRow[] = [
    ...scoredClients,
    ...unscoredClients,
  ]
    .slice(0, TOP_N)
    .map((c) => ({
      id: c.id,
      name: c.name,
      securityScore: c.securityScore,
      href: `/clients/${c.id}`,
    }));

  return {
    findingsBySeverity: mapSeverityGroups(findingsBySeverity),
    incidentsBySeverity: mapSeverityGroups(incidentsBySeverity),
    securityEventsBySeverity: mapSeverityGroups(securityEventsBySeverity),
    assetRiskBuckets: tallyBuckets(assets.map((a) => a.securityScore)),
    clientRiskBuckets: tallyBuckets(clients.map((c) => c.securityScore)),
    highestRiskAssets,
    highestRiskClients,
  };
}

async function buildOperationalOverview(organizationId: string) {
  const since7 = daysAgo(7);
  const since30 = daysAgo(30);

  const [
    invByAnalyst,
    incByAnalyst,
    attentionSummary,
    notificationVolume7d,
    notificationVolume30d,
    investigationBacklog,
    analystsWithWork,
  ] = await Promise.all([
    prisma.investigationGroup.groupBy({
      by: ["assignedToUserId"],
      where: {
        organizationId,
        status: { in: ACTIVE_INVESTIGATION_STATUSES },
        assignedToUserId: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.incident.groupBy({
      by: ["assignedToUserId"],
      where: {
        organizationId,
        status: { in: OPEN_INCIDENT_STATUSES },
        assignedToUserId: { not: null },
      },
      _count: { _all: true },
    }),
    getAttentionSummary(organizationId, { topN: 1 }),
    prisma.notification.count({
      where: { organizationId, createdAt: { gte: since7 } },
    }),
    prisma.notification.count({
      where: { organizationId, createdAt: { gte: since30 } },
    }),
    prisma.investigationGroup.count({
      where: {
        organizationId,
        OR: [
          { status: "OPEN" },
          { status: "PENDING" },
          {
            createdByType: "SYSTEM_SUGGESTED",
            status: { in: ACTIVE_INVESTIGATION_STATUSES },
          },
        ],
      },
    }),
    prisma.user.findMany({
      where: { organizationId },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const userMap = new Map(
    analystsWithWork.map((u) => [u.id, u.name?.trim() || u.email])
  );

  const toWorkload = (
    rows: Array<{ assignedToUserId: string | null; _count: { _all: number } }>
  ): AnalystWorkloadRow[] =>
    rows
      .filter((r): r is { assignedToUserId: string; _count: { _all: number } } =>
        Boolean(r.assignedToUserId)
      )
      .map((r) => ({
        userId: r.assignedToUserId,
        name: userMap.get(r.assignedToUserId) ?? "Unknown",
        count: r._count._all,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_N);

  const invRows = toWorkload(invByAnalyst);
  const incRows = toWorkload(incByAnalyst);

  const workloadByUser = new Map<string, number>();
  for (const r of [...invRows, ...incRows]) {
    workloadByUser.set(r.userId, (workloadByUser.get(r.userId) ?? 0) + r.count);
  }
  const loads = [...workloadByUser.values()];
  const averageAnalystWorkload =
    loads.length === 0
      ? null
      : Math.round((loads.reduce((a, b) => a + b, 0) / loads.length) * 10) / 10;

  return {
    openInvestigationsByAnalyst: invRows,
    openIncidentsByAnalyst: incRows,
    attentionQueueSize: attentionSummary.total,
    notificationVolume7d,
    notificationVolume30d,
    averageAnalystWorkload,
    investigationBacklog,
  };
}

async function buildClientOverview(
  organizationId: string
): Promise<ExecutiveClientOverviewRow[]> {
  const clients = await prisma.client.findMany({
    where: {
      organizationId,
      status: { notIn: [...EXCLUDED_CLIENT_STATUSES] },
    },
    select: {
      id: true,
      name: true,
      securityScore: true,
      updatedAt: true,
      _count: {
        select: { assets: true },
      },
    },
    orderBy: [{ securityScore: "asc" }, { name: "asc" }],
    take: TOP_N,
  });

  if (clients.length === 0) return [];

  const clientIds = clients.map((c) => c.id);

  const [
    incidentGroups,
    findingGroups,
    investigationGroups,
    lastIncidents,
    lastFindings,
    lastEvents,
  ] = await Promise.all([
    prisma.incident.groupBy({
      by: ["clientId"],
      where: {
        organizationId,
        clientId: { in: clientIds },
        status: { in: OPEN_INCIDENT_STATUSES },
      },
      _count: { _all: true },
    }),
    prisma.finding.groupBy({
      by: ["clientId"],
      where: {
        organizationId,
        clientId: { in: clientIds },
        status: { in: UNRESOLVED_FINDING_STATUSES },
      },
      _count: { _all: true },
    }),
    prisma.investigationGroup.groupBy({
      by: ["clientId"],
      where: {
        organizationId,
        clientId: { in: clientIds },
        status: { in: ACTIVE_INVESTIGATION_STATUSES },
      },
      _count: { _all: true },
    }),
    prisma.incident.findMany({
      where: { organizationId, clientId: { in: clientIds } },
      orderBy: { updatedAt: "desc" },
      distinct: ["clientId"],
      select: { clientId: true, updatedAt: true },
    }),
    prisma.finding.findMany({
      where: { organizationId, clientId: { in: clientIds } },
      orderBy: { updatedAt: "desc" },
      distinct: ["clientId"],
      select: { clientId: true, updatedAt: true },
    }),
    prisma.securityEvent.findMany({
      where: { organizationId, clientId: { in: clientIds } },
      orderBy: { updatedAt: "desc" },
      distinct: ["clientId"],
      select: { clientId: true, updatedAt: true },
    }),
  ]);

  const incMap = new Map(
    incidentGroups.map((g) => [g.clientId, g._count._all])
  );
  const findingMap = new Map(
    findingGroups
      .filter((g) => g.clientId)
      .map((g) => [g.clientId as string, g._count._all])
  );
  const invMap = new Map(
    investigationGroups
      .filter((g) => g.clientId)
      .map((g) => [g.clientId as string, g._count._all])
  );

  const lastActivity = new Map<string, Date>();
  const consider = (clientId: string | null, at: Date) => {
    if (!clientId) return;
    const prev = lastActivity.get(clientId);
    if (!prev || at > prev) lastActivity.set(clientId, at);
  };
  for (const row of lastIncidents) consider(row.clientId, row.updatedAt);
  for (const row of lastFindings) consider(row.clientId, row.updatedAt);
  for (const row of lastEvents) consider(row.clientId, row.updatedAt);

  return clients.map((c) => {
    const activity = lastActivity.get(c.id) ?? c.updatedAt;
    return {
      id: c.id,
      name: c.name,
      assets: c._count.assets,
      openIncidents: incMap.get(c.id) ?? 0,
      openFindings: findingMap.get(c.id) ?? 0,
      openInvestigations: invMap.get(c.id) ?? 0,
      securityPosture: c.securityScore,
      lastActivityAt: activity,
    };
  });
}

/**
 * Primary executive dashboard payload (org-scoped).
 */
export async function getExecutiveDashboard(input: {
  organizationId: string;
}): Promise<ExecutiveDashboardData> {
  const { organizationId } = input;
  const since7 = daysAgo(7);
  const since30 = daysAgo(30);

  const [
    totalClients,
    totalAssets,
    activeInvestigations,
    openIncidents,
    criticalFindings,
    openSecurityEvents,
    criticalIncidents,
    sla,
    trends7,
    trends30,
    risk,
    operational,
    clients,
    health,
    wazuhState,
    assetScoreAgg,
  ] = await Promise.all([
    prisma.client.count({
      where: {
        organizationId,
        status: { notIn: [...EXCLUDED_CLIENT_STATUSES] },
      },
    }),
    prisma.asset.count({ where: { organizationId } }),
    prisma.investigationGroup.count({
      where: {
        organizationId,
        status: { in: ACTIVE_INVESTIGATION_STATUSES },
      },
    }),
    prisma.incident.count({
      where: {
        organizationId,
        status: { in: OPEN_INCIDENT_STATUSES },
      },
    }),
    prisma.finding.count({
      where: {
        organizationId,
        status: { in: UNRESOLVED_FINDING_STATUSES },
        severity: "CRITICAL",
      },
    }),
    prisma.securityEvent.count({
      where: {
        organizationId,
        status: { in: ACTIVE_STATUSES },
      },
    }),
    prisma.incident.count({
      where: {
        organizationId,
        status: { in: OPEN_INCIDENT_STATUSES },
        severity: "CRITICAL",
      },
    }),
    buildSlaCompliance(organizationId),
    countTrendPeriod(organizationId, since7),
    countTrendPeriod(organizationId, since30),
    buildRiskDistribution(organizationId),
    buildOperationalOverview(organizationId),
    buildClientOverview(organizationId),
    getHealthCheckResult(),
    prisma.wazuhIngestionState.findUnique({
      where: { organizationId },
      select: { lastSuccessfulSyncAt: true },
    }),
    prisma.asset.aggregate({
      where: { organizationId, securityScore: { not: null } },
      _avg: { securityScore: true },
    }),
  ]);

  const posture = calculateExecutivePostureScore({
    criticalIncidents,
    criticalFindings,
    breachedSla: sla.breached,
    openInvestigations: activeInvestigations,
    openSecurityEvents,
  });

  const trends: ExecutiveTrends = {
    last7Days: trends7,
    last30Days: trends30,
  };

  const assetAvg = assetScoreAgg._avg.securityScore;
  const assetPostureAverage =
    assetAvg == null ? null : Math.round(assetAvg * 10) / 10;

  return {
    kpis: {
      totalClients,
      totalAssets,
      activeInvestigations,
      openIncidents,
      criticalFindings,
      openSecurityEvents,
      posture,
      assetPostureAverage,
    },
    trends,
    risk,
    sla,
    operational,
    clients,
    platformHealth: {
      overallStatus: health.status,
      application: health.checks.application.status,
      database: health.checks.database.status,
      wazuhWorker: health.checks.workers.wazuh.status,
      slaWorker: health.checks.workers.slaEscalation.status,
      lastSyncAt: wazuhState?.lastSuccessfulSyncAt?.toISOString() ?? null,
      lastHealthCheckAt: health.timestamp,
      buildVersion: health.version,
      gitSha: health.gitSha,
      databaseLatencyMs: health.checks.database.latencyMs ?? null,
    },
  };
}
