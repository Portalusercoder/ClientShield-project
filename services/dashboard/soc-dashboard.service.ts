/**
 * SOC Analyst Dashboard aggregation (Phase 6C1).
 * Batched Prisma queries + reused SLA calculator / attention / health services.
 */
import { prisma } from "@/lib/db";
import { listAttentionItems } from "@/services/attention/attention.service";
import {
  formatAgeMs,
  maxSeverity,
  oldestAgeMs,
  startOfUtcDay,
} from "@/services/dashboard/dashboard-aggregates";
import { deriveSlaEscalationTriggers } from "@/services/escalation/sla-escalation-evaluator.service";
import { getHealthCheckResult } from "@/services/health.service";
import { getIncidentCaseMetrics } from "@/services/incidents/queries";
import { OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import {
  ACTIVE_INVESTIGATION_STATUSES,
} from "@/services/investigations/status-transitions";
import {
  listNotificationInbox,
} from "@/services/notifications/notification.service";
import { evaluateIncidentSla } from "@/services/sla/sla-calculator.service";
import { loadActiveSnapshotsForIncidents } from "@/services/sla/sla-snapshot.service";
import { UNRESOLVED_FINDING_STATUSES } from "@/types/findings";
import type {
  FindingDashboardRow,
  IncidentDashboardRow,
  InvestigationDashboardRow,
  MyWorkCard,
  SecurityEventDashboardRow,
  SocAnalystDashboardData,
} from "@/types/soc-dashboard";

const RECENT_LIMIT = 8;
const MY_WORK_ATTENTION_PAGE = 50;

async function buildMyWork(
  organizationId: string,
  userId: string
): Promise<MyWorkCard[]> {
  const invWhere = {
    organizationId,
    assignedToUserId: userId,
    status: { in: ACTIVE_INVESTIGATION_STATUSES },
  } as const;
  const incWhere = {
    organizationId,
    assignedToUserId: userId,
    status: { in: OPEN_INCIDENT_STATUSES },
  } as const;
  const findingWhere = {
    organizationId,
    assignedToUserId: userId,
    status: { in: UNRESOLVED_FINDING_STATUSES },
  } as const;

  const [
    invCount,
    invSeverityGroups,
    oldestInv,
    incCount,
    incSeverityGroups,
    oldestInc,
    findingCount,
    findingSeverityGroups,
    oldestFinding,
    attentionMine,
  ] = await Promise.all([
    prisma.investigationGroup.count({ where: invWhere }),
    prisma.investigationGroup.groupBy({
      by: ["severity"],
      where: invWhere,
      _count: { _all: true },
    }),
    prisma.investigationGroup.findFirst({
      where: invWhere,
      orderBy: [{ assignedAt: "asc" }, { createdAt: "asc" }],
      select: { assignedAt: true, createdAt: true },
    }),
    prisma.incident.count({ where: incWhere }),
    prisma.incident.groupBy({
      by: ["severity"],
      where: incWhere,
      _count: { _all: true },
    }),
    prisma.incident.findFirst({
      where: incWhere,
      orderBy: { detectedAt: "asc" },
      select: { detectedAt: true },
    }),
    prisma.finding.count({ where: findingWhere }),
    prisma.finding.groupBy({
      by: ["severity"],
      where: findingWhere,
      _count: { _all: true },
    }),
    prisma.finding.findFirst({
      where: findingWhere,
      orderBy: { firstDetectedAt: "asc" },
      select: { firstDetectedAt: true },
    }),
    listAttentionItems(
      organizationId,
      { ownership: "MINE", page: 1, pageSize: MY_WORK_ATTENTION_PAGE },
      { viewerUserId: userId }
    ),
  ]);

  return [
    {
      key: "investigations",
      label: "Assigned Investigations",
      count: invCount,
      highestSeverity: maxSeverity(invSeverityGroups.map((g) => g.severity)),
      oldestAgeMs: oldestAgeMs([
        oldestInv?.assignedAt ?? oldestInv?.createdAt ?? null,
      ]),
      href: "/investigations",
    },
    {
      key: "incidents",
      label: "Assigned Incidents",
      count: incCount,
      highestSeverity: maxSeverity(incSeverityGroups.map((g) => g.severity)),
      oldestAgeMs: oldestAgeMs([oldestInc?.detectedAt ?? null]),
      href: `/incidents?assignedToUserId=${encodeURIComponent(userId)}`,
    },
    {
      key: "findings",
      label: "Assigned Findings",
      count: findingCount,
      highestSeverity: maxSeverity(
        findingSeverityGroups.map((g) => g.severity)
      ),
      oldestAgeMs: oldestAgeMs([oldestFinding?.firstDetectedAt ?? null]),
      href: `/vulnerabilities?assignedToUserId=${encodeURIComponent(userId)}`,
    },
    {
      key: "attention",
      label: "Claimed Attention Items",
      count: attentionMine.total,
      highestSeverity: maxSeverity(attentionMine.items.map((r) => r.severity)),
      oldestAgeMs: oldestAgeMs(attentionMine.items.map((r) => r.waitingSince)),
      href: "/attention?ownership=MINE",
    },
  ];
}

async function buildSlaOverview(organizationId: string) {
  const [openIncidents, policyCount] = await Promise.all([
    prisma.incident.findMany({
      where: {
        organizationId,
        status: { in: OPEN_INCIDENT_STATUSES },
        severity: { in: ["CRITICAL", "HIGH"] },
      },
      select: {
        id: true,
        severity: true,
        detectedAt: true,
        acknowledgedAt: true,
        containedAt: true,
        resolvedAt: true,
      },
    }),
    prisma.slaPolicy.count({
      where: { organizationId, enabled: true },
    }),
  ]);

  const snapshots = await loadActiveSnapshotsForIncidents({
    organizationId,
    incidentIds: openIncidents.map((i) => i.id),
  });

  const now = new Date();
  let atRisk = 0;
  let breached = 0;
  let withinSla = 0;
  let upcomingEscalations = 0;

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

    if (evaluation.overallState === "APPROACHING") atRisk += 1;
    else if (evaluation.overallState === "BREACHED") breached += 1;
    else if (evaluation.overallState === "ON_TRACK") withinSla += 1;

    if (snapshot) {
      const triggers = deriveSlaEscalationTriggers({
        evaluationMetrics: evaluation.metrics,
        severityAtSnapshot: snapshot.severityAtSnapshot,
        approachingThresholdPct: snapshot.approachingThresholdPct,
        acknowledgedAt: incident.acknowledgedAt,
        detectedAt: incident.detectedAt,
        now,
      });
      if (
        triggers.some(
          (t) => t.dedupeSuffix === "HALF" || t.dedupeSuffix === "APPROACHING"
        )
      ) {
        upcomingEscalations += 1;
      }
    }
  }

  return {
    atRisk,
    breached,
    withinSla,
    upcomingEscalations,
    hasSlaPolicies: policyCount > 0,
  };
}

async function buildSecurityEventsSection(organizationId: string) {
  const dayStart = startOfUtcDay();

  const [newToday, untriaged, escalated, convertedToInvestigations, recentRows] =
    await Promise.all([
      prisma.securityEvent.count({
        where: {
          organizationId,
          firstSeenAt: { gte: dayStart },
        },
      }),
      prisma.securityEvent.count({
        where: { organizationId, status: "NEW" },
      }),
      prisma.securityEvent.count({
        where: { organizationId, status: "ESCALATED" },
      }),
      prisma.securityEvent.count({
        where: {
          organizationId,
          investigationGroupEvents: {
            some: { organizationId, removedAt: null },
          },
        },
      }),
      prisma.securityEvent.findMany({
        where: { organizationId },
        orderBy: { lastSeenAt: "desc" },
        take: RECENT_LIMIT,
        select: {
          id: true,
          title: true,
          lastSeenAt: true,
          severity: true,
          source: true,
          status: true,
          asset: { select: { name: true } },
        },
      }),
    ]);

  const recent: SecurityEventDashboardRow[] = recentRows.map((r) => ({
    id: r.id,
    title: r.title,
    timestamp: r.lastSeenAt,
    severity: r.severity,
    source: r.source,
    assetName: r.asset?.name ?? null,
    status: r.status,
  }));

  return {
    newToday,
    untriaged,
    escalated,
    convertedToInvestigations,
    recent,
  };
}

async function buildInvestigationsSection(organizationId: string) {
  const dayStart = startOfUtcDay();

  const [open, pending, resolvedToday, recentRows] = await Promise.all([
    prisma.investigationGroup.count({
      where: {
        organizationId,
        status: { in: ACTIVE_INVESTIGATION_STATUSES },
      },
    }),
    prisma.investigationGroup.count({
      where: { organizationId, status: "PENDING" },
    }),
    prisma.investigationGroup.count({
      where: {
        organizationId,
        status: "RESOLVED",
        updatedAt: { gte: dayStart },
      },
    }),
    prisma.investigationGroup.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        updatedAt: true,
        assignedTo: { select: { name: true, email: true } },
      },
    }),
  ]);

  const recentlyUpdated: InvestigationDashboardRow[] = recentRows.map((r) => ({
    id: r.id,
    title: r.title,
    severity: r.severity,
    ownerName: r.assignedTo?.name?.trim() || r.assignedTo?.email || null,
    status: r.status,
    updatedAt: r.updatedAt,
  }));

  return { open, pending, resolvedToday, recentlyUpdated };
}

async function buildIncidentsSection(organizationId: string) {
  const dayStart = startOfUtcDay();

  const [open, critical, resolvedToday, caseMetrics, recentRows] =
    await Promise.all([
      prisma.incident.count({
        where: {
          organizationId,
          status: { in: OPEN_INCIDENT_STATUSES },
        },
      }),
      prisma.incident.count({
        where: {
          organizationId,
          status: { in: OPEN_INCIDENT_STATUSES },
          severity: "CRITICAL",
        },
      }),
      prisma.incident.count({
        where: {
          organizationId,
          status: { in: ["RESOLVED", "CLOSED"] },
          resolvedAt: { gte: dayStart },
        },
      }),
      getIncidentCaseMetrics(organizationId),
      prisma.incident.findMany({
        where: { organizationId },
        orderBy: { detectedAt: "desc" },
        take: RECENT_LIMIT,
        select: {
          id: true,
          caseNumber: true,
          title: true,
          severity: true,
          status: true,
          detectedAt: true,
          assignedTo: { select: { name: true, email: true } },
        },
      }),
    ]);

  const recent: IncidentDashboardRow[] = recentRows.map((r) => ({
    id: r.id,
    caseNumber: r.caseNumber,
    title: r.title,
    severity: r.severity,
    status: r.status,
    detectedAt: r.detectedAt,
    assignedToName:
      r.assignedTo?.name?.trim() || r.assignedTo?.email || null,
  }));

  return {
    open,
    critical,
    resolvedToday,
    meanResolutionTimeMs: caseMetrics.meanTimeToResolveMs,
    recent,
  };
}

async function buildFindingsSection(organizationId: string) {
  const [open, critical, resolved, newestRows, recentRows] = await Promise.all([
    prisma.finding.count({
      where: {
        organizationId,
        status: { in: UNRESOLVED_FINDING_STATUSES },
      },
    }),
    prisma.finding.count({
      where: {
        organizationId,
        status: { in: UNRESOLVED_FINDING_STATUSES },
        severity: "CRITICAL",
      },
    }),
    prisma.finding.count({
      where: { organizationId, status: "RESOLVED" },
    }),
    prisma.finding.findMany({
      where: { organizationId },
      orderBy: { firstDetectedAt: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        firstDetectedAt: true,
        asset: { select: { name: true } },
      },
    }),
    prisma.finding.findMany({
      where: {
        organizationId,
        status: { in: UNRESOLVED_FINDING_STATUSES },
      },
      orderBy: { lastDetectedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        lastDetectedAt: true,
        asset: { select: { name: true } },
      },
    }),
  ]);

  const mapFinding = (
    r: {
      id: string;
      title: string;
      severity: FindingDashboardRow["severity"];
      status: FindingDashboardRow["status"];
      asset: { name: string };
    } & ({ firstDetectedAt: Date } | { lastDetectedAt: Date })
  ): FindingDashboardRow => ({
    id: r.id,
    title: r.title,
    severity: r.severity,
    status: r.status,
    assetName: r.asset.name,
    detectedAt:
      "firstDetectedAt" in r ? r.firstDetectedAt : r.lastDetectedAt,
  });

  return {
    open,
    critical,
    resolved,
    newest: newestRows.map(mapFinding),
    recent: recentRows.map(mapFinding),
  };
}

async function buildNotificationsSection(
  organizationId: string,
  userId: string
) {
  const inbox = await listNotificationInbox({
    organizationId,
    userId,
    filter: "ALL",
    page: 1,
  });
  return {
    unreadCount: inbox.unreadCount,
    recent: inbox.items.slice(0, RECENT_LIMIT),
  };
}

async function buildSystemHealth(organizationId: string) {
  const [health, wazuhState] = await Promise.all([
    getHealthCheckResult(),
    prisma.wazuhIngestionState.findUnique({
      where: { organizationId },
      select: { lastSuccessfulSyncAt: true },
    }),
  ]);

  return {
    overallStatus: health.status,
    application: health.checks.application.status,
    database: health.checks.database.status,
    wazuhWorker: health.checks.workers.wazuh.status,
    slaWorker: health.checks.workers.slaEscalation.status,
    lastSyncAt: wazuhState?.lastSuccessfulSyncAt?.toISOString() ?? null,
    lastHealthCheckAt: health.timestamp,
    databaseLatencyMs: health.checks.database.latencyMs ?? null,
  };
}

/**
 * Primary SOC analyst dashboard payload for the authenticated user.
 */
export async function getSocAnalystDashboard(input: {
  organizationId: string;
  userId: string;
}): Promise<SocAnalystDashboardData> {
  const { organizationId, userId } = input;

  const [
    myWork,
    sla,
    securityEvents,
    investigations,
    incidents,
    findings,
    notifications,
    systemHealth,
  ] = await Promise.all([
    buildMyWork(organizationId, userId),
    buildSlaOverview(organizationId),
    buildSecurityEventsSection(organizationId),
    buildInvestigationsSection(organizationId),
    buildIncidentsSection(organizationId),
    buildFindingsSection(organizationId),
    buildNotificationsSection(organizationId, userId),
    buildSystemHealth(organizationId),
  ]);

  return {
    myWork,
    sla,
    securityEvents,
    investigations,
    incidents,
    findings,
    notifications,
    systemHealth,
    slaStateLabels: {
      atRisk: "APPROACHING",
      breached: "BREACHED",
      withinSla: "ON_TRACK",
    },
  };
}

export { formatAgeMs };
