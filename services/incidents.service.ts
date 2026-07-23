import type {
  FindingSeverity,
  IncidentActivityType,
  IncidentSeverity,
  IncidentStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import { assertMatchesTargetClient } from "@/lib/client-isolation";
import { prisma } from "@/lib/db";
import { sanitizeIncidentText } from "@/lib/incidents/sanitize";
import type {
  AssignIncidentInput,
  CreateIncidentInput,
  EscalateFindingInput,
  IncidentFiltersInput,
  UpdateIncidentResponseInput,
} from "@/lib/validations/incidents";
import { createAuditLog } from "@/services/audit.service";
import {
  createIncidentSlaSnapshot,
  evaluateIncidentSlaForIncident,
} from "@/services/sla/sla-snapshot.service";
import { appendIncidentActivity } from "@/services/incidents/activity";
import { allocateNextCaseNumber } from "@/services/incidents/case-number.service";
import {
  assertCanCloseIncident,
  requireClosureOk,
} from "@/services/incidents/closure.service";
import {
  ALLOWED_INCIDENT_TRANSITIONS,
  assertIncidentTransition,
  OPEN_INCIDENT_STATUSES,
} from "@/services/incidents/status-transitions";
import { statusToPhaseLabel } from "@/types/incident-case";
import type { IncidentCaseMetrics } from "@/types/incident-case";
import type {
  DashboardIncident,
  IncidentDetail,
  IncidentListResult,
  IncidentSlaMetrics,
  IncidentSummaryCounts,
} from "@/types/incidents";
import { countOverdueResponseTasks } from "@/services/incidents/response-task.service";

const ASSIGNABLE_ROLES: UserRole[] = ["ANALYST", "ADMIN", "OWNER"];

const SEVERITY_ORDER: IncidentSeverity[] = [
  "INFO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

function mapFindingSeverityToIncident(
  severity: FindingSeverity
): IncidentSeverity {
  // Conservative mapping — never escalate INFO findings to high incident severity
  switch (severity) {
    case "CRITICAL":
      return "HIGH";
    case "HIGH":
      return "MEDIUM";
    case "MEDIUM":
      return "MEDIUM";
    case "LOW":
      return "LOW";
    case "INFO":
      return "INFO";
    default:
      return "MEDIUM";
  }
}

function diffMs(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  return Math.max(0, to.getTime() - from.getTime());
}

export function calculateIncidentSla(timestamps: {
  detectedAt: Date;
  acknowledgedAt: Date | null;
  containedAt: Date | null;
  resolvedAt: Date | null;
}): IncidentSlaMetrics {
  return {
    timeToAcknowledgeMs: diffMs(
      timestamps.detectedAt,
      timestamps.acknowledgedAt
    ),
    timeToContainMs: diffMs(timestamps.detectedAt, timestamps.containedAt),
    timeToResolveMs: diffMs(timestamps.detectedAt, timestamps.resolvedAt),
  };
}

function timestampFieldsForStatus(
  to: IncidentStatus,
  now: Date
): Partial<{
  acknowledgedAt: Date;
  investigationStartedAt: Date;
  containedAt: Date;
  eradicatedAt: Date;
  recoveringAt: Date;
  resolvedAt: Date;
  closedAt: Date;
}> {
  switch (to) {
    case "ACKNOWLEDGED":
      return { acknowledgedAt: now };
    case "INVESTIGATING":
      return { investigationStartedAt: now };
    case "CONTAINED":
      return { containedAt: now };
    case "ERADICATED":
      return { eradicatedAt: now };
    case "RECOVERING":
      return { recoveringAt: now };
    case "RESOLVED":
      return { resolvedAt: now };
    case "CLOSED":
      return { closedAt: now };
    default:
      return {};
  }
}

async function assertClientInOrg(
  organizationId: string,
  clientId: string
): Promise<void> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true },
  });
  if (!client) throw new Error("Client not found");
}

async function assertAssetInOrg(
  organizationId: string,
  assetId: string,
  clientId?: string
): Promise<{ clientId: string }> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId },
    select: { id: true, clientId: true },
  });
  if (!asset) throw new Error("Asset not found");
  if (clientId && asset.clientId !== clientId) {
    throw new Error("Asset does not belong to the selected client");
  }
  return { clientId: asset.clientId };
}

async function assertAssigneeInOrg(
  organizationId: string,
  userId: string
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      organizationId,
      role: { in: ASSIGNABLE_ROLES },
    },
    select: { id: true },
  });
  if (!user) {
    throw new Error(
      "Assignee must be an ANALYST, ADMIN, or OWNER in this organization"
    );
  }
}

async function getIncidentOrThrow(organizationId: string, incidentId: string) {
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, organizationId },
  });
  if (!incident) throw new Error("Incident not found");
  return incident;
}

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


export async function createIncident(input: {
  organizationId: string;
  actorId: string;
  data: CreateIncidentInput;
}): Promise<{ id: string }> {
  const { organizationId, actorId, data } = input;

  await assertClientInOrg(organizationId, data.clientId);
  if (data.assetId) {
    await assertAssetInOrg(organizationId, data.assetId, data.clientId);
  }
  if (data.assignedToUserId) {
    await assertAssigneeInOrg(organizationId, data.assignedToUserId);
  }

  const now = new Date();
  const title = sanitizeIncidentText(data.title, 300) ?? data.title;
  const description =
    sanitizeIncidentText(data.description) ?? data.description;
  const businessImpact = sanitizeIncidentText(data.businessImpact, 2000);
  const technicalImpact = sanitizeIncidentText(data.technicalImpact, 2000);

  const incident = await prisma.$transaction(async (tx) => {
    const caseNumber = await allocateNextCaseNumber(organizationId, tx);

    const created = await tx.incident.create({
      data: {
        organizationId,
        clientId: data.clientId,
        assetId: data.assetId,
        caseNumber,
        title,
        description,
        severity: data.severity,
        status: "OPEN",
        category: data.category,
        source: data.source ?? "MANUAL",
        detectionMethod: data.detectionMethod ?? "MANUAL",
        externalSourceId: data.externalSourceId ?? null,
        assignedToUserId: data.assignedToUserId,
        createdByUserId: actorId,
        occurredAt: data.occurredAt ? new Date(data.occurredAt) : null,
        detectedAt: now,
        reportedAt: now,
        businessImpact,
        technicalImpact,
      },
    });

    await tx.incidentActivity.create({
      data: {
        organizationId,
        incidentId: created.id,
        actorUserId: actorId,
        activityType: "CREATED",
        message: `Incident created: ${title}`,
        metadata: {
          severity: data.severity,
          category: data.category,
          source: data.source ?? "MANUAL",
        },
      },
    });

    if (data.findingId) {
      const finding = await tx.finding.findFirst({
        where: { id: data.findingId, organizationId },
        select: { id: true, title: true },
      });
      if (!finding) throw new Error("Finding not found");

      await tx.incidentFinding.create({
        data: {
          organizationId,
          incidentId: created.id,
          findingId: finding.id,
          linkedByUserId: actorId,
        },
      });
      await tx.incidentActivity.create({
        data: {
          organizationId,
          incidentId: created.id,
          actorUserId: actorId,
          activityType: "FINDING_LINKED",
          message: `Finding linked: ${finding.title}`,
          metadata: { findingId: finding.id },
        },
      });
    }

    if (data.assignedToUserId) {
      await tx.incidentActivity.create({
        data: {
          organizationId,
          incidentId: created.id,
          actorUserId: actorId,
          activityType: "ASSIGNED",
          message: "Incident assigned",
          metadata: { assignedToUserId: data.assignedToUserId },
        },
      });
    }

    return created;
  });

  await createAuditLog({
    organizationId,
    actorId,
    action: "INCIDENT_CREATED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: {
      title: incident.title,
      caseNumber: incident.caseNumber,
      severity: data.severity,
      category: data.category,
      clientId: data.clientId,
      source: data.source ?? "MANUAL",
    },
  });

  // Snapshot effective SLA obligation if HIGH/CRITICAL policy exists.
  // No backfill for historical incidents; no snapshot when NO_POLICY.
  await createIncidentSlaSnapshot({
    organizationId,
    actorId,
    incident,
    reason: "CREATED",
  });

  return { id: incident.id };
}

export async function escalateFindingToIncident(input: {
  organizationId: string;
  actorId: string;
  data: EscalateFindingInput;
}): Promise<{ id: string }> {
  const finding = await prisma.finding.findFirst({
    where: { id: input.data.findingId, organizationId: input.organizationId },
    select: {
      id: true,
      title: true,
      severity: true,
      clientId: true,
      assetId: true,
      description: true,
    },
  });
  if (!finding) throw new Error("Finding not found");
  if (!finding.clientId) {
    throw new Error("Finding must be associated with a client to escalate");
  }

  const severity =
    input.data.severity ?? mapFindingSeverityToIncident(finding.severity);
  const title =
    sanitizeIncidentText(
      input.data.title ?? `Security Incident: ${finding.title}`,
      300
    ) ?? `Security Incident: ${finding.title}`;

  const description =
    sanitizeIncidentText(
      input.data.description ??
        `Escalated from finding "${finding.title}" (${finding.id}). Analyst-confirmed incident — scanner evidence not copied.`
    ) ??
    `Escalated from finding "${finding.title}". Analyst-confirmed incident — scanner evidence not copied.`;

  return createIncident({
    organizationId: input.organizationId,
    actorId: input.actorId,
    data: {
      clientId: finding.clientId,
      assetId: finding.assetId,
      title,
      description,
      severity,
      category: input.data.category ?? "VULNERABILITY_EXPLOITATION",
      source: "FINDING",
      detectionMethod: "VULNERABILITY_SCANNER",
      assignedToUserId: null,
      occurredAt: null,
      businessImpact: null,
      technicalImpact: null,
      findingId: finding.id,
    },
  });
}

export async function updateIncidentStatus(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  status: IncidentStatus;
  reason?: string | null;
  closingNote?: string | null;
}): Promise<{ id: string; status: IncidentStatus }> {
  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );
  assertIncidentTransition(incident.status, input.status);

  const isReopen =
    (incident.status === "RESOLVED" || incident.status === "CLOSED") &&
    input.status === "INVESTIGATING";

  if (isReopen) {
    const reason = sanitizeIncidentText(input.reason, 2000);
    if (!reason) {
      throw new Error("Reopening an incident requires a reason");
    }
  }

  if (input.status === "CLOSED") {
    requireClosureOk(
      await assertCanCloseIncident({
        organizationId: input.organizationId,
        incidentId: input.incidentId,
        closingNote: input.closingNote ?? "",
      })
    );
  }

  const now = new Date();
  const stamps = timestampFieldsForStatus(input.status, now);

  // Only set timestamps if not already set (preserve first transition time)
  const data: Prisma.IncidentUpdateInput = {
    status: input.status,
  };
  if (stamps.acknowledgedAt && !incident.acknowledgedAt) {
    data.acknowledgedAt = stamps.acknowledgedAt;
  }
  if (stamps.investigationStartedAt && !incident.investigationStartedAt) {
    data.investigationStartedAt = stamps.investigationStartedAt;
  }
  if (stamps.containedAt && !incident.containedAt) {
    data.containedAt = stamps.containedAt;
  }
  if (stamps.eradicatedAt && !incident.eradicatedAt) {
    data.eradicatedAt = stamps.eradicatedAt;
  }
  if (stamps.recoveringAt && !incident.recoveringAt) {
    data.recoveringAt = stamps.recoveringAt;
  }
  if (stamps.resolvedAt) {
    data.resolvedAt = stamps.resolvedAt;
  }
  if (stamps.closedAt) {
    data.closedAt = stamps.closedAt;
  }
  // Reopen clears closed/resolved terminal markers when returning to investigation
  if (
    incident.status === "RESOLVED" ||
    incident.status === "CLOSED"
  ) {
    if (input.status === "INVESTIGATING") {
      data.closedAt = null;
      data.resolvedAt = null;
    }
  }

  await prisma.incident.update({
    where: { id: incident.id },
    data,
  });

  let activityType: IncidentActivityType = "STATUS_CHANGED";
  if (input.status === "ACKNOWLEDGED") activityType = "ACKNOWLEDGED";
  else if (input.status === "RESOLVED") activityType = "RESOLVED";
  else if (input.status === "CLOSED") activityType = "CLOSED";
  else if (isReopen) activityType = "REOPENED";

  const reopenReason = sanitizeIncidentText(input.reason, 2000);
  const closingNote = sanitizeIncidentText(input.closingNote, 5000);

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: incident.id,
    actorUserId: input.actorId,
    activityType,
    message: isReopen
      ? `Incident reopened (${incident.status} → ${input.status}): ${reopenReason}`
      : input.status === "CLOSED" && closingNote
        ? `Incident closed: ${closingNote}`
        : `Status changed from ${incident.status} to ${input.status}`,
    metadata: {
      from: incident.status,
      to: input.status,
      ...(isReopen ? { reason: reopenReason } : {}),
      ...(input.status === "CLOSED" ? { closingNote } : {}),
    },
  });

  if (input.status === "CLOSED" && closingNote) {
    await prisma.incidentNote.create({
      data: {
        organizationId: input.organizationId,
        incidentId: incident.id,
        authorUserId: input.actorId,
        content: closingNote,
      },
    });
  }

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: isReopen
      ? "INCIDENT_REOPENED"
      : input.status === "ACKNOWLEDGED"
        ? "INCIDENT_ACKNOWLEDGED"
        : input.status === "INVESTIGATING" && incident.status === "ACKNOWLEDGED"
          ? "INCIDENT_INVESTIGATION_STARTED"
          : input.status === "RESOLVED"
            ? "INCIDENT_RESOLVED"
            : input.status === "CLOSED"
              ? "INCIDENT_CLOSED"
              : "INCIDENT_STATUS_CHANGED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: {
      from: incident.status,
      to: input.status,
      ...(isReopen ? { reason: reopenReason } : {}),
    },
  });

  // Reopen starts a new SLA generation from CURRENT policy (previous snapshot retained).
  if (isReopen) {
    await createIncidentSlaSnapshot({
      organizationId: input.organizationId,
      actorId: input.actorId,
      incident: {
        id: incident.id,
        organizationId: incident.organizationId,
        clientId: incident.clientId,
        severity: incident.severity,
      },
      reason: "REOPENED",
    });
  }

  return { id: incident.id, status: input.status };
}

export async function updateIncidentSeverity(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  severity: IncidentSeverity;
}): Promise<void> {
  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );
  if (incident.severity === input.severity) return;

  await prisma.incident.update({
    where: { id: incident.id },
    data: { severity: input.severity },
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: incident.id,
    actorUserId: input.actorId,
    activityType: "SEVERITY_CHANGED",
    message: `Severity changed from ${incident.severity} to ${input.severity}`,
    metadata: { from: incident.severity, to: input.severity },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_SEVERITY_CHANGED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: { from: incident.severity, to: input.severity },
  });
}

export async function assignIncident(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  data: AssignIncidentInput;
}): Promise<void> {
  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );

  if (input.data.assignedToUserId) {
    await assertAssigneeInOrg(
      input.organizationId,
      input.data.assignedToUserId
    );
  }

  await prisma.incident.update({
    where: { id: incident.id },
    data: { assignedToUserId: input.data.assignedToUserId },
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: incident.id,
    actorUserId: input.actorId,
    activityType: "ASSIGNED",
    message: input.data.assignedToUserId
      ? "Incident assignment updated"
      : "Incident unassigned",
    metadata: {
      from: incident.assignedToUserId,
      to: input.data.assignedToUserId,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_ASSIGNED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: {
      from: incident.assignedToUserId,
      to: input.data.assignedToUserId,
    },
  });
}

export async function updateIncidentResponse(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  data: UpdateIncidentResponseInput;
}): Promise<void> {
  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );

  const sanitized = {
    rootCause: sanitizeIncidentText(input.data.rootCause),
    containmentSummary: sanitizeIncidentText(input.data.containmentSummary),
    eradicationSummary: sanitizeIncidentText(input.data.eradicationSummary),
    recoverySummary: sanitizeIncidentText(input.data.recoverySummary),
    resolutionSummary: sanitizeIncidentText(input.data.resolutionSummary),
    lessonsLearned: sanitizeIncidentText(input.data.lessonsLearned),
    businessImpact: sanitizeIncidentText(input.data.businessImpact, 2000),
    technicalImpact: sanitizeIncidentText(input.data.technicalImpact, 2000),
    impactSummary: sanitizeIncidentText(input.data.impactSummary),
    scopeSummary: sanitizeIncidentText(input.data.scopeSummary),
    whatWentWell: sanitizeIncidentText(input.data.whatWentWell),
    whatCouldImprove: sanitizeIncidentText(input.data.whatCouldImprove),
    followUpActions: sanitizeIncidentText(input.data.followUpActions),
  };

  const data: Prisma.IncidentUpdateInput = {};
  const activities: {
    type: IncidentActivityType;
    message: string;
    field: string;
  }[] = [];

  const fieldMap: {
    key: keyof typeof sanitized;
    type: IncidentActivityType;
    label: string;
  }[] = [
    { key: "rootCause", type: "INVESTIGATION_UPDATED", label: "Root cause" },
    {
      key: "containmentSummary",
      type: "CONTAINMENT_UPDATED",
      label: "Containment",
    },
    {
      key: "eradicationSummary",
      type: "ERADICATION_UPDATED",
      label: "Eradication",
    },
    { key: "recoverySummary", type: "RECOVERY_UPDATED", label: "Recovery" },
    {
      key: "resolutionSummary",
      type: "RESOLUTION_UPDATED",
      label: "Resolution",
    },
    { key: "lessonsLearned", type: "LESSONS_UPDATED", label: "Lessons learned" },
    {
      key: "impactSummary",
      type: "POST_INCIDENT_UPDATED",
      label: "Impact summary",
    },
    {
      key: "scopeSummary",
      type: "POST_INCIDENT_UPDATED",
      label: "Scope summary",
    },
    {
      key: "whatWentWell",
      type: "POST_INCIDENT_UPDATED",
      label: "What went well",
    },
    {
      key: "whatCouldImprove",
      type: "POST_INCIDENT_UPDATED",
      label: "What could improve",
    },
    {
      key: "followUpActions",
      type: "POST_INCIDENT_UPDATED",
      label: "Follow-up actions",
    },
  ];

  for (const { key, type, label } of fieldMap) {
    if (input.data[key as keyof UpdateIncidentResponseInput] !== undefined) {
      (data as Record<string, string | null>)[key] = sanitized[key];
      activities.push({
        type,
        message: `${label} updated`,
        field: key,
      });
    }
  }
  if (input.data.businessImpact !== undefined) {
    data.businessImpact = sanitized.businessImpact;
  }
  if (input.data.technicalImpact !== undefined) {
    data.technicalImpact = sanitized.technicalImpact;
  }

  await prisma.incident.update({
    where: { id: incident.id },
    data,
  });

  for (const activity of activities) {
    await appendIncidentActivity({
      organizationId: input.organizationId,
      incidentId: incident.id,
      actorUserId: input.actorId,
      activityType: activity.type,
      message: activity.message,
      metadata: { field: activity.field },
    });
  }

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_RESPONSE_UPDATED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: { fields: activities.map((a) => a.field) },
  });
}

export async function addIncidentNote(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  content: string;
}): Promise<void> {
  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );
  const content = sanitizeIncidentText(input.content);
  if (!content) throw new Error("Note cannot be empty");

  await prisma.incidentNote.create({
    data: {
      organizationId: input.organizationId,
      incidentId: incident.id,
      authorUserId: input.actorId,
      content,
    },
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: incident.id,
    actorUserId: input.actorId,
    activityType: "NOTE_ADDED",
    message: "Analyst note added",
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_NOTE_ADDED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: { contentPreview: content.slice(0, 120) },
  });
}

export async function linkFindingToIncident(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  findingId: string;
}): Promise<void> {
  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );
  const finding = await prisma.finding.findFirst({
    where: { id: input.findingId, organizationId: input.organizationId },
    select: { id: true, title: true, clientId: true },
  });
  if (!finding) throw new Error("Finding not found");

  assertMatchesTargetClient({
    sourceClientId: finding.clientId,
    targetClientId: incident.clientId,
    context: "finding → incident",
  });

  const existing = await prisma.incidentFinding.findUnique({
    where: {
      incidentId_findingId: {
        incidentId: incident.id,
        findingId: finding.id,
      },
    },
  });
  if (existing) throw new Error("Finding is already linked to this incident");

  await prisma.incidentFinding.create({
    data: {
      organizationId: input.organizationId,
      incidentId: incident.id,
      findingId: finding.id,
      linkedByUserId: input.actorId,
    },
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: incident.id,
    actorUserId: input.actorId,
    activityType: "FINDING_LINKED",
    message: `Finding linked: ${finding.title}`,
    metadata: { findingId: finding.id },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_FINDING_LINKED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: { findingId: finding.id },
  });
}

export async function unlinkFindingFromIncident(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  findingId: string;
}): Promise<void> {
  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );

  const link = await prisma.incidentFinding.findFirst({
    where: {
      organizationId: input.organizationId,
      incidentId: incident.id,
      findingId: input.findingId,
    },
    include: { finding: { select: { title: true } } },
  });
  if (!link) throw new Error("Finding link not found");

  await prisma.incidentFinding.delete({ where: { id: link.id } });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: incident.id,
    actorUserId: input.actorId,
    activityType: "FINDING_UNLINKED",
    message: `Finding unlinked: ${link.finding.title}`,
    metadata: { findingId: input.findingId },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_FINDING_UNLINKED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: { findingId: input.findingId },
  });
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
