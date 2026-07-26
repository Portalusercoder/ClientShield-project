import type { FindingSeverity, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { IncidentFiltersInput } from "@/lib/validations/incidents";
import { calculateIncidentSla } from "@/services/incidents/sla";
import {
  ASSIGNABLE_ROLES,
  assertAssetInOrg,
  assertClientInOrg,
  diffMs,
  SEVERITY_ORDER,
} from "@/services/incidents/shared";
import { ALLOWED_INCIDENT_TRANSITIONS, OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import { countOverdueResponseTasks } from "@/services/incidents/response-task.service";
import { evaluateIncidentSlaForIncident } from "@/services/sla/sla-snapshot.service";
import { statusToPhaseLabel } from "@/types/incident-case";
import type { IncidentCaseMetrics } from "@/types/incident-case";
import type {
  DashboardIncident,
  IncidentDetail,
  IncidentListResult,
  IncidentSummaryCounts,
} from "@/types/incidents";

export async function getIncidentSummary(
  organizationId: string
): Promise<IncidentSummaryCounts> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    criticalOpen,
    highOpen,
    investigating,
    contained,
    resolvedThisMonth,
    unassigned,
  ] = await Promise.all([
    prisma.incident.count({
      where: {
        organizationId,
        severity: "CRITICAL",
        status: { in: OPEN_INCIDENT_STATUSES },
      },
    }),
    prisma.incident.count({
      where: {
        organizationId,
        severity: "HIGH",
        status: { in: OPEN_INCIDENT_STATUSES },
      },
    }),
    prisma.incident.count({
      where: { organizationId, status: "INVESTIGATING" },
    }),
    prisma.incident.count({
      where: { organizationId, status: "CONTAINED" },
    }),
    prisma.incident.count({
      where: {
        organizationId,
        status: "RESOLVED",
        resolvedAt: { gte: startOfMonth },
      },
    }),
    prisma.incident.count({
      where: {
        organizationId,
        assignedToUserId: null,
        status: { in: OPEN_INCIDENT_STATUSES },
      },
    }),
  ]);

  return {
    criticalOpen,
    highOpen,
    investigating,
    contained,
    resolvedThisMonth,
    unassigned,
  };
}

export async function countOpenIncidents(
  organizationId: string
): Promise<number> {
  return prisma.incident.count({
    where: {
      organizationId,
      status: { in: OPEN_INCIDENT_STATUSES },
    },
  });
}

export async function getRecentIncidents(
  organizationId: string,
  limit = 5
): Promise<DashboardIncident[]> {
  const rows = await prisma.incident.findMany({
    where: { organizationId },
    orderBy: { detectedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      detectedAt: true,
      client: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    severity: r.severity,
    status: r.status,
    clientName: r.client.name,
    detectedAt: r.detectedAt,
    assignedToName: r.assignedTo?.name ?? null,
  }));
}

export async function listIncidents(
  organizationId: string,
  filters: IncidentFiltersInput
): Promise<IncidentListResult> {
  const {
    search,
    caseNumber,
    clientId,
    assetId,
    severity,
    status,
    category,
    source,
    assignedToUserId,
    leadAnalystUserId,
    page,
    pageSize,
    sortBy,
    sortDir,
    detectedFrom,
    detectedTo,
  } = filters;

  const where: Prisma.IncidentWhereInput = {
    organizationId,
    ...(clientId && clientId !== "ALL" ? { clientId } : {}),
    ...(assetId && assetId !== "ALL" ? { assetId } : {}),
    ...(severity && severity !== "ALL" ? { severity } : {}),
    ...(status && status !== "ALL" ? { status } : {}),
    ...(category && category !== "ALL" ? { category } : {}),
    ...(source && source !== "ALL" ? { source } : {}),
    ...(caseNumber
      ? { caseNumber: { contains: caseNumber, mode: "insensitive" } }
      : {}),
    ...(assignedToUserId && assignedToUserId !== "ALL"
      ? assignedToUserId === "UNASSIGNED"
        ? { assignedToUserId: null }
        : { assignedToUserId }
      : {}),
    ...(leadAnalystUserId && leadAnalystUserId !== "ALL"
      ? { leadAnalystUserId }
      : {}),
    ...(detectedFrom || detectedTo
      ? {
          detectedAt: {
            ...(detectedFrom ? { gte: new Date(detectedFrom) } : {}),
            ...(detectedTo ? { lte: new Date(detectedTo) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { caseNumber: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  let orderBy: Prisma.IncidentOrderByWithRelationInput = {
    [sortBy]: sortDir,
  };
  if (sortBy === "severity") {
    // Prisma can't order by enum priority meaningfully; fall back to updatedAt
    // and sort in memory after fetch for the page (acceptable for pageSize <= 100).
    orderBy = { updatedAt: sortDir };
  }

  const [rows, total, summary, clients, assets, users] = await Promise.all([
    prisma.incident.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        caseNumber: true,
        title: true,
        severity: true,
        status: true,
        category: true,
        source: true,
        clientId: true,
        assetId: true,
        assignedToUserId: true,
        leadAnalystUserId: true,
        detectedAt: true,
        updatedAt: true,
        client: { select: { name: true } },
        asset: { select: { name: true } },
        assignedTo: { select: { name: true } },
        leadAnalyst: { select: { name: true } },
      },
    }),
    prisma.incident.count({ where }),
    getIncidentSummary(organizationId),
    prisma.client.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.asset.findMany({
      where: { organizationId },
      select: { id: true, name: true, clientId: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { organizationId, role: { in: ASSIGNABLE_ROLES } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  let incidents = rows.map((r) => ({
    id: r.id,
    caseNumber: r.caseNumber,
    title: r.title,
    severity: r.severity,
    currentPhase: statusToPhaseLabel(r.status),
    leadAnalystUserId: r.leadAnalystUserId,
    leadAnalystName: r.leadAnalyst?.name ?? null,
    status: r.status,
    category: r.category,
    source: r.source,
    clientId: r.clientId,
    clientName: r.client.name,
    assetId: r.assetId,
    assetName: r.asset?.name ?? null,
    assignedToUserId: r.assignedToUserId,
    assignedToName: r.assignedTo?.name ?? null,
    detectedAt: r.detectedAt,
    updatedAt: r.updatedAt,
  }));

  if (sortBy === "severity") {
    incidents = [...incidents].sort((a, b) => {
      const diff =
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
      return sortDir === "asc" ? diff : -diff;
    });
  }

  return {
    incidents,
    total,
    page,
    pageSize,
    summary,
    clients,
    assets,
    users,
  };
}

export async function listIncidentsForClient(
  organizationId: string,
  clientId: string,
  limit = 50
) {
  await assertClientInOrg(organizationId, clientId);
  const rows = await prisma.incident.findMany({
    where: { organizationId, clientId },
    orderBy: { detectedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      detectedAt: true,
      asset: { select: { id: true, name: true } },
      assignedTo: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    severity: r.severity,
    status: r.status,
    detectedAt: r.detectedAt,
    assetId: r.asset?.id ?? null,
    assetName: r.asset?.name ?? null,
    assignedToName: r.assignedTo?.name ?? null,
  }));
}

export async function listIncidentsForAsset(
  organizationId: string,
  assetId: string,
  limit = 50
) {
  await assertAssetInOrg(organizationId, assetId);
  const rows = await prisma.incident.findMany({
    where: { organizationId, assetId },
    orderBy: { detectedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      detectedAt: true,
      assignedTo: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    severity: r.severity,
    status: r.status,
    detectedAt: r.detectedAt,
    assignedToName: r.assignedTo?.name ?? null,
  }));
}

export async function getIncidentById(
  organizationId: string,
  incidentId: string
): Promise<IncidentDetail | null> {
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, organizationId },
    include: {
      client: { select: { name: true } },
      asset: { select: { name: true } },
      assignedTo: { select: { name: true, email: true } },
      leadAnalyst: { select: { name: true, email: true } },
      commander: { select: { name: true, email: true } },
      createdBy: { select: { name: true } },
      activities: {
        orderBy: { createdAt: "desc" },
        include: {
          actor: { select: { name: true, email: true } },
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { name: true, email: true } },
        },
      },
      findings: {
        include: {
          finding: {
            select: {
              id: true,
              title: true,
              severity: true,
              status: true,
              source: true,
              lastDetectedAt: true,
              asset: { select: { name: true } },
              _count: { select: { instances: true } },
              remediationTasks: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  priority: true,
                  findingId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!incident) return null;

  const users = await prisma.user.findMany({
    where: { organizationId, role: { in: ASSIGNABLE_ROLES } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const remediationsMap = new Map<
    string,
    {
      id: string;
      title: string;
      status: string;
      priority: string;
      findingId: string;
      findingTitle: string;
    }
  >();

  for (const link of incident.findings) {
    for (const task of link.finding.remediationTasks) {
      if (!remediationsMap.has(task.id)) {
        remediationsMap.set(task.id, {
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          findingId: link.finding.id,
          findingTitle: link.finding.title,
        });
      }
    }
  }

  return {
    id: incident.id,
    caseNumber: incident.caseNumber,
    title: incident.title,
    description: incident.description,
    severity: incident.severity,
    status: incident.status,
    currentPhase: statusToPhaseLabel(incident.status),
    category: incident.category,
    source: incident.source,
    externalSourceId: incident.externalSourceId,
    detectionMethod: incident.detectionMethod,
    clientId: incident.clientId,
    clientName: incident.client.name,
    assetId: incident.assetId,
    assetName: incident.asset?.name ?? null,
    assignedToUserId: incident.assignedToUserId,
    assignedToName: incident.assignedTo?.name ?? null,
    assignedToEmail: incident.assignedTo?.email ?? null,
    leadAnalystUserId: incident.leadAnalystUserId,
    leadAnalystName: incident.leadAnalyst?.name ?? null,
    leadAnalystEmail: incident.leadAnalyst?.email ?? null,
    commanderUserId: incident.commanderUserId,
    commanderName: incident.commander?.name ?? null,
    commanderEmail: incident.commander?.email ?? null,
    createdByUserId: incident.createdByUserId,
    createdByName: incident.createdBy?.name ?? null,
    occurredAt: incident.occurredAt,
    detectedAt: incident.detectedAt,
    reportedAt: incident.reportedAt,
    declaredAt: incident.declaredAt,
    acknowledgedAt: incident.acknowledgedAt,
    investigationStartedAt: incident.investigationStartedAt,
    containedAt: incident.containedAt,
    eradicatedAt: incident.eradicatedAt,
    recoveringAt: incident.recoveringAt,
    resolvedAt: incident.resolvedAt,
    closedAt: incident.closedAt,
    businessImpact: incident.businessImpact,
    technicalImpact: incident.technicalImpact,
    impactSummary: incident.impactSummary,
    scopeSummary: incident.scopeSummary,
    rootCause: incident.rootCause,
    containmentSummary: incident.containmentSummary,
    eradicationSummary: incident.eradicationSummary,
    recoverySummary: incident.recoverySummary,
    resolutionSummary: incident.resolutionSummary,
    lessonsLearned: incident.lessonsLearned,
    whatWentWell: incident.whatWentWell,
    whatCouldImprove: incident.whatCouldImprove,
    followUpActions: incident.followUpActions,
    createdAt: incident.createdAt,
    updatedAt: incident.updatedAt,
    sla: calculateIncidentSla({
      detectedAt: incident.detectedAt,
      acknowledgedAt: incident.acknowledgedAt,
      containedAt: incident.containedAt,
      resolvedAt: incident.resolvedAt,
    }),
    findings: incident.findings.map((link) => ({
      linkId: link.id,
      findingId: link.finding.id,
      title: link.finding.title,
      severity: link.finding.severity,
      status: link.finding.status,
      source: link.finding.source,
      assetName: link.finding.asset?.name ?? null,
      instanceCount: link.finding._count.instances,
      lastDetectedAt: link.finding.lastDetectedAt,
    })),
    remediations: [...remediationsMap.values()],
    activities: incident.activities.map((a) => ({
      id: a.id,
      activityType: a.activityType,
      message: a.message,
      metadata: a.metadata,
      createdAt: a.createdAt,
      actorName: a.actor?.name ?? null,
      actorEmail: a.actor?.email ?? null,
    })),
    notes: incident.notes.map((n) => ({
      id: n.id,
      content: n.content,
      createdAt: n.createdAt,
      authorName: n.author.name,
      authorEmail: n.author.email,
    })),
    allowedTransitions: ALLOWED_INCIDENT_TRANSITIONS[incident.status] ?? [],
    users,
    contractualSla: await evaluateIncidentSlaForIncident({
      organizationId,
      incident,
    }),
  };
}

export async function searchFindingsForLink(input: {
  organizationId: string;
  clientId?: string;
  search?: string;
  limit?: number;
}): Promise<
  {
    id: string;
    title: string;
    severity: FindingSeverity;
    status: string;
    assetName: string | null;
  }[]
> {
  const rows = await prisma.finding.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(input.search
        ? {
            OR: [
              { title: { contains: input.search, mode: "insensitive" } },
              { code: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    take: input.limit ?? 20,
    orderBy: { lastDetectedAt: "desc" },
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      asset: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    severity: r.severity,
    status: r.status,
    assetName: r.asset?.name ?? null,
  }));
}

/** Reporting helpers for a future phase (not wired into PDFs yet). */
export async function getIncidentReportStats(organizationId: string) {
  const [open, bySeverity, byCategory, resolved] = await Promise.all([
    countOpenIncidents(organizationId),
    prisma.incident.groupBy({
      by: ["severity"],
      where: { organizationId },
      _count: true,
    }),
    prisma.incident.groupBy({
      by: ["category"],
      where: { organizationId },
      _count: true,
    }),
    prisma.incident.findMany({
      where: {
        organizationId,
        status: { in: ["RESOLVED", "CLOSED"] },
        resolvedAt: { not: null },
      },
      select: {
        detectedAt: true,
        acknowledgedAt: true,
        containedAt: true,
        resolvedAt: true,
      },
    }),
  ]);

  const mean = (values: number[]) =>
    values.length === 0
      ? null
      : values.reduce((a, b) => a + b, 0) / values.length;

  const tta = resolved
    .map((i) => diffMs(i.detectedAt, i.acknowledgedAt))
    .filter((v): v is number => v != null);
  const ttc = resolved
    .map((i) => diffMs(i.detectedAt, i.containedAt))
    .filter((v): v is number => v != null);
  const ttr = resolved
    .map((i) => diffMs(i.detectedAt, i.resolvedAt))
    .filter((v): v is number => v != null);

  return {
    openIncidents: open,
    resolvedIncidents: resolved.length,
    bySeverity,
    byCategory,
    meanTimeToAcknowledgeMs: mean(tta),
    meanTimeToContainMs: mean(ttc),
    meanTimeToResolveMs: mean(ttr),
  };
}

/** Case-management dashboard metrics (distinct from Findings / Security Events). */
export async function getIncidentCaseMetrics(
  organizationId: string
): Promise<IncidentCaseMetrics> {
  const [
    openCases,
    criticalHighOpen,
    investigating,
    containment,
    recovery,
    overdueTasks,
    resolved,
  ] = await Promise.all([
    prisma.incident.count({
      where: { organizationId, status: { in: OPEN_INCIDENT_STATUSES } },
    }),
    prisma.incident.count({
      where: {
        organizationId,
        status: { in: OPEN_INCIDENT_STATUSES },
        severity: { in: ["CRITICAL", "HIGH"] },
      },
    }),
    prisma.incident.count({
      where: { organizationId, status: "INVESTIGATING" },
    }),
    prisma.incident.count({
      where: { organizationId, status: "CONTAINED" },
    }),
    prisma.incident.count({
      where: { organizationId, status: "RECOVERING" },
    }),
    countOverdueResponseTasks(organizationId),
    prisma.incident.findMany({
      where: {
        organizationId,
        status: { in: ["RESOLVED", "CLOSED"] },
        resolvedAt: { not: null },
      },
      select: {
        detectedAt: true,
        acknowledgedAt: true,
        containedAt: true,
        resolvedAt: true,
      },
    }),
  ]);

  const mean = (values: number[]) =>
    values.length === 0
      ? null
      : values.reduce((a, b) => a + b, 0) / values.length;

  const tta = resolved
    .map((i) => diffMs(i.detectedAt, i.acknowledgedAt))
    .filter((v): v is number => v != null);
  const ttc = resolved
    .map((i) => diffMs(i.detectedAt, i.containedAt))
    .filter((v): v is number => v != null);
  const ttr = resolved
    .map((i) => diffMs(i.detectedAt, i.resolvedAt))
    .filter((v): v is number => v != null);

  return {
    openCases,
    criticalHighOpen,
    investigating,
    containment,
    recovery,
    overdueTasks,
    meanTimeToAcknowledgeMs: mean(tta),
    meanTimeToContainMs: mean(ttc),
    meanTimeToResolveMs: mean(ttr),
  };
}
