import type {
  IncidentSeverity,
  Prisma,
  SecurityEventSeverity,
  SecurityEventStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { sanitizeIncidentText } from "@/lib/incidents/sanitize";
import { WAZUH_WORKER_STALE_MS } from "@/lib/wazuh/constants";
import type {
  DismissSecurityEventInput,
  EscalateSecurityEventInput,
  LinkSecurityEventToIncidentInput,
  SecurityEventFiltersInput,
} from "@/lib/validations/security-events";
import { createAuditLog } from "@/services/audit.service";
import { createIncident } from "@/services/incidents.service";
import { sanitizeFreeText } from "@/services/wazuh/wazuh-sanitizer.service";
import type {
  DashboardSecurityEvent,
  SecurityEventDetail,
  SecurityEventListResult,
  SecurityEventSocMetrics,
  SecurityEventSummaryCounts,
  WazuhIntegrationStatus,
} from "@/types/security-events";
import { checkWazuhIndexerHealth } from "@/services/wazuh/wazuh-indexer-client.service";
import { checkWazuhManagerHealth } from "@/services/wazuh/wazuh-manager-client.service";
import { recordSecurityEventActivity } from "@/services/security-events/security-event-activity.service";

const ACTIVE_STATUSES: SecurityEventStatus[] = [
  "NEW",
  "REVIEWING",
  "ACKNOWLEDGED",
];

function mapEventSeverityToIncident(
  severity: SecurityEventSeverity
): IncidentSeverity {
  switch (severity) {
    case "CRITICAL":
      return "CRITICAL";
    case "HIGH":
      return "HIGH";
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

async function getEventOrThrow(organizationId: string, id: string) {
  const event = await prisma.securityEvent.findFirst({
    where: { id, organizationId },
  });
  if (!event) throw new Error("Security event not found");
  return event;
}

export async function getSecurityEventSummaryCounts(
  organizationId: string
): Promise<SecurityEventSummaryCounts> {
  const [newEvents, critical, high, unmapped, escalated] = await Promise.all([
    prisma.securityEvent.count({
      where: { organizationId, status: "NEW" },
    }),
    prisma.securityEvent.count({
      where: {
        organizationId,
        severity: "CRITICAL",
        status: { in: ACTIVE_STATUSES },
      },
    }),
    prisma.securityEvent.count({
      where: {
        organizationId,
        severity: "HIGH",
        status: { in: ACTIVE_STATUSES },
      },
    }),
    prisma.securityEvent.count({
      where: {
        organizationId,
        clientId: null,
        status: { in: ACTIVE_STATUSES },
      },
    }),
    prisma.securityEvent.count({
      where: { organizationId, status: "ESCALATED" },
    }),
  ]);
  return { newEvents, critical, high, unmapped, escalated };
}

export async function listSecurityEvents(
  organizationId: string,
  filters: SecurityEventFiltersInput
): Promise<SecurityEventListResult> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  const where: Prisma.SecurityEventWhereInput = { organizationId };

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { summary: { contains: filters.search, mode: "insensitive" } },
      { ruleId: { contains: filters.search, mode: "insensitive" } },
      { agentName: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters.severity) where.severity = filters.severity;
  if (filters.status) where.status = filters.status;
  if (filters.classification) where.classification = filters.classification;
  if (filters.source) where.source = filters.source;
  if (filters.clientId) where.clientId = filters.clientId;
  if (filters.assetId) where.assetId = filters.assetId;
  if (filters.agentId) where.agentId = filters.agentId;
  if (filters.ruleId) where.ruleId = filters.ruleId;
  if (filters.dateFrom || filters.dateTo) {
    where.lastSeenAt = {};
    if (filters.dateFrom) where.lastSeenAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.lastSeenAt.lte = new Date(filters.dateTo);
  }

  const sortDir = filters.sort === "oldest" ? "asc" : "desc";

  const [total, events, summary, clients, assets] = await Promise.all([
    prisma.securityEvent.count({ where }),
    prisma.securityEvent.findMany({
      where,
      orderBy: { lastSeenAt: sortDir },
      skip,
      take: pageSize,
      include: {
        client: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true } },
      },
    }),
    getSecurityEventSummaryCounts(organizationId),
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
  ]);

  return {
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      severity: e.severity,
      status: e.status,
      classification: e.classification,
      source: e.source,
      ruleId: e.ruleId,
      ruleLevel: e.ruleLevel,
      ruleDescription: e.ruleDescription,
      clientId: e.clientId,
      clientName: e.client?.name ?? null,
      assetId: e.assetId,
      assetName: e.asset?.name ?? null,
      agentId: e.agentId,
      agentName: e.agentName,
      occurrenceCount: e.occurrenceCount,
      firstSeenAt: e.firstSeenAt,
      lastSeenAt: e.lastSeenAt,
    })),
    total,
    page,
    pageSize,
    summary,
    clients,
    assets,
  };
}

export async function getSecurityEventDetail(
  organizationId: string,
  id: string
): Promise<SecurityEventDetail | null> {
  const event = await prisma.securityEvent.findFirst({
    where: { id, organizationId },
    include: {
      client: { select: { id: true, name: true } },
      asset: {
        select: {
          id: true,
          name: true,
          type: true,
          environment: true,
          criticality: true,
        },
      },
      reviewedBy: { select: { id: true, name: true, email: true } },
      dismissedBy: { select: { id: true, name: true, email: true } },
      incidents: {
        include: {
          incident: {
            select: {
              id: true,
              title: true,
              status: true,
              severity: true,
            },
          },
        },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!event) return null;

  const [agentMapping, linkableIncidents] = await Promise.all([
    event.agentId
      ? prisma.wazuhAgentMapping.findUnique({
          where: {
            organizationId_wazuhAgentId: {
              organizationId,
              wazuhAgentId: event.agentId,
            },
          },
          select: { lastKnownStatus: true },
        })
      : Promise.resolve(null),
    event.clientId
      ? prisma.incident.findMany({
          where: {
            organizationId,
            clientId: event.clientId,
            status: { notIn: ["CLOSED"] },
          },
          select: { id: true, title: true, status: true, severity: true },
          orderBy: { updatedAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
  ]);

  return {
    id: event.id,
    title: event.title,
    summary: event.summary,
    severity: event.severity,
    status: event.status,
    classification: event.classification,
    source: event.source,
    externalEventId: event.externalEventId,
    ruleId: event.ruleId,
    ruleLevel: event.ruleLevel,
    ruleDescription: event.ruleDescription,
    ruleGroups: event.ruleGroups,
    agentId: event.agentId,
    agentName: event.agentName,
    agentStatus: agentMapping?.lastKnownStatus ?? null,
    clientId: event.clientId,
    clientName: event.client?.name ?? null,
    assetId: event.assetId,
    assetName: event.asset?.name ?? null,
    assetType: event.asset?.type ?? null,
    assetEnvironment: event.asset?.environment ?? null,
    assetCriticality: event.asset?.criticality ?? null,
    firstSeenAt: event.firstSeenAt,
    lastSeenAt: event.lastSeenAt,
    occurrenceCount: event.occurrenceCount,
    correlationSummary: event.correlationSummary,
    scaCheckId: event.scaCheckId,
    sourceIp: event.sourceIp,
    destinationIp: event.destinationIp,
    sourcePort: event.sourcePort,
    destinationPort: event.destinationPort,
    protocol: event.protocol,
    username: event.username,
    processName: event.processName,
    filePath: event.filePath,
    commandLine: event.commandLine,
    mitreTactics: event.mitreTactics,
    mitreTechniques: event.mitreTechniques,
    pciDss: event.pciDss,
    gdpr: event.gdpr,
    hipaa: event.hipaa,
    nist: event.nist,
    rawDataSanitized: event.rawDataSanitized,
    reviewedAt: event.reviewedAt,
    reviewedByName: event.reviewedBy?.name ?? event.reviewedBy?.email ?? null,
    acknowledgedAt: event.acknowledgedAt,
    dismissedAt: event.dismissedAt,
    dismissedByName:
      event.dismissedBy?.name ?? event.dismissedBy?.email ?? null,
    dismissalReason: event.dismissalReason,
    linkedIncidents: event.incidents.map((l) => ({
      linkId: l.id,
      incidentId: l.incident.id,
      title: l.incident.title,
      status: l.incident.status,
      severity: l.incident.severity,
    })),
    activities: event.activities.map((a) => ({
      id: a.id,
      activityType: a.activityType,
      message: a.message,
      note: a.note,
      metadata: a.metadata,
      createdAt: a.createdAt,
      actorName: a.actor?.name ?? a.actor?.email ?? null,
    })),
    linkableIncidents: linkableIncidents.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      severity: i.severity,
    })),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export async function startSecurityEventReview(input: {
  organizationId: string;
  actorId: string;
  eventId: string;
}): Promise<void> {
  const event = await getEventOrThrow(input.organizationId, input.eventId);
  if (event.status !== "NEW" && event.status !== "ACKNOWLEDGED") {
    throw new Error("Event cannot be moved to reviewing from current status");
  }
  const now = new Date();
  await prisma.securityEvent.update({
    where: { id: event.id },
    data: {
      status: "REVIEWING",
      reviewedAt: now,
      reviewedByUserId: input.actorId,
    },
  });
  await recordSecurityEventActivity({
    organizationId: input.organizationId,
    securityEventId: event.id,
    actorUserId: input.actorId,
    activityType: "REVIEW_STARTED",
    message: "Analyst started review",
  });
  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "SECURITY_EVENT_REVIEW_STARTED",
    resourceType: "SecurityEvent",
    resourceId: event.id,
  });
}

export async function acknowledgeSecurityEvent(input: {
  organizationId: string;
  actorId: string;
  eventId: string;
}): Promise<void> {
  const event = await getEventOrThrow(input.organizationId, input.eventId);
  if (event.status === "ESCALATED" || event.status === "DISMISSED") {
    throw new Error("Event cannot be acknowledged in current status");
  }
  const now = new Date();
  await prisma.securityEvent.update({
    where: { id: event.id },
    data: {
      status: "ACKNOWLEDGED",
      acknowledgedAt: now,
      reviewedAt: event.reviewedAt ?? now,
      reviewedByUserId: event.reviewedByUserId ?? input.actorId,
    },
  });
  await recordSecurityEventActivity({
    organizationId: input.organizationId,
    securityEventId: event.id,
    actorUserId: input.actorId,
    activityType: "ACKNOWLEDGED",
    message: "Event acknowledged",
  });
  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "SECURITY_EVENT_ACKNOWLEDGED",
    resourceType: "SecurityEvent",
    resourceId: event.id,
  });
}

export async function dismissSecurityEvent(input: {
  organizationId: string;
  actorId: string;
  eventId: string;
  data: DismissSecurityEventInput;
}): Promise<void> {
  const event = await getEventOrThrow(input.organizationId, input.eventId);
  if (event.status === "ESCALATED") {
    throw new Error("Escalated events cannot be dismissed");
  }
  const reason = sanitizeFreeText(input.data.reason, 1000);
  if (!reason || reason.length < 3) {
    throw new Error("Dismissal reason is required");
  }

  await prisma.securityEvent.update({
    where: { id: event.id },
    data: {
      status: "DISMISSED",
      dismissedAt: new Date(),
      dismissedByUserId: input.actorId,
      dismissalReason: reason,
    },
  });
  await recordSecurityEventActivity({
    organizationId: input.organizationId,
    securityEventId: event.id,
    actorUserId: input.actorId,
    activityType: "DISMISSED",
    message: "Event dismissed",
    note: reason,
  });
  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "SECURITY_EVENT_DISMISSED",
    resourceType: "SecurityEvent",
    resourceId: event.id,
    metadata: { reason },
  });
}

export async function escalateSecurityEventToIncident(input: {
  organizationId: string;
  actorId: string;
  eventId: string;
  data: EscalateSecurityEventInput;
}): Promise<{ incidentId: string }> {
  const event = await getEventOrThrow(input.organizationId, input.eventId);
  if (event.status === "DISMISSED") {
    throw new Error("Dismissed events cannot be escalated");
  }
  if (!event.clientId) {
    throw new Error(
      "Security event must be mapped to a client before escalation"
    );
  }

  const severity =
    input.data.severity ?? mapEventSeverityToIncident(event.severity);
  const title =
    sanitizeIncidentText(
      input.data.title ?? `Security Incident: ${event.title}`,
      300
    ) ?? `Security Incident: ${event.title}`;

  const description =
    sanitizeIncidentText(
      input.data.description ??
        `Escalated from Wazuh security event (${event.id}). Rule: ${event.ruleId ?? "n/a"}. Occurrences: ${event.occurrenceCount}. Sanitized summary only — raw telemetry not copied.`
    ) ??
    `Escalated from Wazuh security event. Sanitized summary only.`;

  const incident = await createIncident({
    organizationId: input.organizationId,
    actorId: input.actorId,
    data: {
      clientId: event.clientId,
      assetId: input.data.assetId ?? event.assetId ?? null,
      title,
      description,
      severity,
      category: input.data.category ?? "SUSPICIOUS_ACTIVITY",
      source: "WAZUH",
      detectionMethod: "SIEM",
      externalSourceId: event.id,
      assignedToUserId: input.data.assignedToUserId ?? null,
      occurredAt: null,
      businessImpact: null,
      technicalImpact: null,
      findingId: null,
    },
  });

  await prisma.incidentSecurityEvent.create({
    data: {
      organizationId: input.organizationId,
      incidentId: incident.id,
      securityEventId: event.id,
      linkedByUserId: input.actorId,
    },
  });

  await prisma.securityEvent.update({
    where: { id: event.id },
    data: { status: "ESCALATED" },
  });

  await prisma.incidentActivity.create({
    data: {
      organizationId: input.organizationId,
      incidentId: incident.id,
      actorUserId: input.actorId,
      activityType: "SECURITY_EVENT_LINKED",
      message: `Security event escalated: ${event.title}`,
      metadata: { securityEventId: event.id },
    },
  });

  await recordSecurityEventActivity({
    organizationId: input.organizationId,
    securityEventId: event.id,
    actorUserId: input.actorId,
    activityType: "ESCALATED",
    message: `Escalated to incident ${incident.id}`,
    metadata: { incidentId: incident.id },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "SECURITY_EVENT_ESCALATED",
    resourceType: "SecurityEvent",
    resourceId: event.id,
    metadata: { incidentId: incident.id },
  });

  return { incidentId: incident.id };
}

export async function linkSecurityEventToIncident(input: {
  organizationId: string;
  actorId: string;
  data: LinkSecurityEventToIncidentInput;
}): Promise<void> {
  const [event, incident] = await Promise.all([
    getEventOrThrow(input.organizationId, input.data.securityEventId),
    prisma.incident.findFirst({
      where: {
        id: input.data.incidentId,
        organizationId: input.organizationId,
      },
    }),
  ]);
  if (!incident) throw new Error("Incident not found");

  const existing = await prisma.incidentSecurityEvent.findUnique({
    where: {
      incidentId_securityEventId: {
        incidentId: incident.id,
        securityEventId: event.id,
      },
    },
  });
  if (existing) {
    throw new Error("Security event is already linked to this incident");
  }

  await prisma.incidentSecurityEvent.create({
    data: {
      organizationId: input.organizationId,
      incidentId: incident.id,
      securityEventId: event.id,
      linkedByUserId: input.actorId,
    },
  });

  if (event.status !== "ESCALATED") {
    await prisma.securityEvent.update({
      where: { id: event.id },
      data: { status: "ESCALATED" },
    });
  }

  await prisma.incidentActivity.create({
    data: {
      organizationId: input.organizationId,
      incidentId: incident.id,
      actorUserId: input.actorId,
      activityType: "SECURITY_EVENT_LINKED",
      message: `Security event linked: ${event.title}`,
      metadata: { securityEventId: event.id },
    },
  });

  await recordSecurityEventActivity({
    organizationId: input.organizationId,
    securityEventId: event.id,
    actorUserId: input.actorId,
    activityType: "LINKED_TO_INCIDENT",
    message: `Linked to incident ${incident.id}`,
    metadata: { incidentId: incident.id },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "SECURITY_EVENT_LINKED_TO_INCIDENT",
    resourceType: "SecurityEvent",
    resourceId: event.id,
    metadata: { incidentId: incident.id },
  });
}

export async function unlinkSecurityEventFromIncident(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  securityEventId: string;
}): Promise<void> {
  const link = await prisma.incidentSecurityEvent.findFirst({
    where: {
      organizationId: input.organizationId,
      incidentId: input.incidentId,
      securityEventId: input.securityEventId,
    },
  });
  if (!link) throw new Error("Link not found");

  await prisma.incidentSecurityEvent.delete({ where: { id: link.id } });

  const remaining = await prisma.incidentSecurityEvent.count({
    where: { securityEventId: input.securityEventId },
  });
  if (remaining === 0) {
    await prisma.securityEvent.update({
      where: { id: input.securityEventId },
      data: { status: "ACKNOWLEDGED" },
    });
  }

  await prisma.incidentActivity.create({
    data: {
      organizationId: input.organizationId,
      incidentId: input.incidentId,
      actorUserId: input.actorId,
      activityType: "SECURITY_EVENT_UNLINKED",
      message: "Security event unlinked from incident",
      metadata: { securityEventId: input.securityEventId },
    },
  });

  await recordSecurityEventActivity({
    organizationId: input.organizationId,
    securityEventId: input.securityEventId,
    actorUserId: input.actorId,
    activityType: "UNLINKED_FROM_INCIDENT",
    message: `Unlinked from incident ${input.incidentId}`,
    metadata: { incidentId: input.incidentId },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "SECURITY_EVENT_UNLINKED_FROM_INCIDENT",
    resourceType: "SecurityEvent",
    resourceId: input.securityEventId,
    metadata: { incidentId: input.incidentId },
  });
}

export async function listSecurityEventsForClient(
  organizationId: string,
  clientId: string,
  limit = 50
) {
  return prisma.securityEvent.findMany({
    where: { organizationId, clientId },
    orderBy: { lastSeenAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      assetId: true,
      agentName: true,
      occurrenceCount: true,
      firstSeenAt: true,
      lastSeenAt: true,
      asset: { select: { name: true } },
    },
  });
}

export async function listSecurityEventsForAsset(
  organizationId: string,
  assetId: string,
  limit = 50
) {
  return prisma.securityEvent.findMany({
    where: { organizationId, assetId },
    orderBy: { lastSeenAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      agentName: true,
      occurrenceCount: true,
      firstSeenAt: true,
      lastSeenAt: true,
      ruleId: true,
    },
  });
}

export async function listSecurityEventsForIncident(
  organizationId: string,
  incidentId: string
) {
  const links = await prisma.incidentSecurityEvent.findMany({
    where: { organizationId, incidentId },
    include: {
      securityEvent: {
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
          ruleId: true,
          ruleDescription: true,
          occurrenceCount: true,
          firstSeenAt: true,
          lastSeenAt: true,
          asset: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return links.map((l) => ({
    linkId: l.id,
    id: l.securityEvent.id,
    title: l.securityEvent.title,
    severity: l.securityEvent.severity,
    status: l.securityEvent.status,
    ruleId: l.securityEvent.ruleId,
    ruleDescription: l.securityEvent.ruleDescription,
    occurrenceCount: l.securityEvent.occurrenceCount,
    firstSeenAt: l.securityEvent.firstSeenAt,
    lastSeenAt: l.securityEvent.lastSeenAt,
    assetId: l.securityEvent.asset?.id ?? null,
    assetName: l.securityEvent.asset?.name ?? null,
  }));
}

export async function getSecurityEventSocMetrics(
  organizationId: string
): Promise<SecurityEventSocMetrics> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    last24hTotal,
    actionable,
    underReview,
    escalated,
    criticalHigh,
    noisy,
    informational,
    ignored,
    severityGroups,
    topRuleGroups,
    topAssetGroups,
    filteredLast24h,
  ] = await Promise.all([
    prisma.securityEvent.count({
      where: { organizationId, lastSeenAt: { gte: since24h } },
    }),
    prisma.securityEvent.count({
      where: {
        organizationId,
        classification: "ACTIONABLE",
        status: { in: ACTIVE_STATUSES },
      },
    }),
    prisma.securityEvent.count({
      where: { organizationId, status: "REVIEWING" },
    }),
    prisma.securityEvent.count({
      where: { organizationId, status: "ESCALATED" },
    }),
    prisma.securityEvent.count({
      where: {
        organizationId,
        severity: { in: ["CRITICAL", "HIGH"] },
        status: { in: ACTIVE_STATUSES },
      },
    }),
    prisma.securityEvent.count({
      where: {
        organizationId,
        classification: "NOISY",
        lastSeenAt: { gte: since24h },
      },
    }),
    prisma.securityEvent.count({
      where: {
        organizationId,
        classification: "INFORMATIONAL",
        lastSeenAt: { gte: since24h },
      },
    }),
    prisma.securityEvent.count({
      where: {
        organizationId,
        classification: "IGNORED",
        lastSeenAt: { gte: since24h },
      },
    }),
    prisma.securityEvent.groupBy({
      by: ["severity"],
      where: { organizationId, lastSeenAt: { gte: since24h } },
      _count: { _all: true },
    }),
    prisma.securityEvent.groupBy({
      by: ["ruleId"],
      where: {
        organizationId,
        lastSeenAt: { gte: since24h },
        ruleId: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { ruleId: "desc" } },
      take: 5,
    }),
    prisma.securityEvent.groupBy({
      by: ["assetId"],
      where: { organizationId, lastSeenAt: { gte: since24h } },
      _count: { _all: true },
      orderBy: { _count: { assetId: "desc" } },
      take: 5,
    }),
    prisma.wazuhProcessedAlert.count({
      where: {
        organizationId,
        createdAt: { gte: since24h },
        disposition: {
          in: ["FILTERED_LEVEL", "FILTERED_DENYLIST", "FILTERED_ALLOWLIST"],
        },
      },
    }),
  ]);

  const ruleIds = topRuleGroups
    .map((r) => r.ruleId)
    .filter((id): id is string => Boolean(id));
  const assetIds = topAssetGroups
    .map((a) => a.assetId)
    .filter((id): id is string => Boolean(id));

  const [ruleSamples, assets] = await Promise.all([
    ruleIds.length
      ? prisma.securityEvent.findMany({
          where: { organizationId, ruleId: { in: ruleIds } },
          select: { ruleId: true, title: true },
          distinct: ["ruleId"],
        })
      : Promise.resolve([]),
    assetIds.length
      ? prisma.asset.findMany({
          where: { organizationId, id: { in: assetIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const titleByRule = new Map(
    ruleSamples.map((r) => [r.ruleId ?? "", r.title] as const)
  );
  const nameByAsset = new Map(assets.map((a) => [a.id, a.name] as const));

  return {
    last24hTotal,
    actionable,
    underReview,
    escalated,
    criticalHigh,
    noisyOrFiltered: noisy + filteredLast24h,
    informational,
    ignored,
    topRules: topRuleGroups.map((r) => ({
      ruleId: r.ruleId ?? "unknown",
      title: titleByRule.get(r.ruleId ?? "") ?? `Rule ${r.ruleId}`,
      count: r._count._all,
    })),
    topAssets: topAssetGroups.map((a) => ({
      assetId: a.assetId,
      assetName: a.assetId
        ? nameByAsset.get(a.assetId) ?? "Unknown asset"
        : "Unmapped",
      count: a._count._all,
    })),
    severityDistribution: severityGroups.map((g) => ({
      severity: g.severity,
      count: g._count._all,
    })),
  };
}

export async function getRecentSecurityEvents(
  organizationId: string,
  limit = 5
): Promise<DashboardSecurityEvent[]> {
  const events = await prisma.securityEvent.findMany({
    where: { organizationId },
    orderBy: { lastSeenAt: "desc" },
    take: limit,
    include: {
      client: { select: { name: true } },
    },
  });
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    severity: e.severity,
    status: e.status,
    clientName: e.client?.name ?? "Unmapped",
    occurrenceCount: e.occurrenceCount,
    lastSeenAt: e.lastSeenAt,
  }));
}

export async function getWazuhIntegrationStatus(
  organizationId: string
): Promise<WazuhIntegrationStatus> {
  const configuredOrg = serverEnv.WAZUH_ORGANIZATION_ID ?? null;
  const enabled = serverEnv.WAZUH_ENABLED;
  const orgMatch = configuredOrg === organizationId;

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [indexer, manager, state, processedLast24h, createdLast24h, correlatedLast24h, filteredLast24h, ignoredLast24h] =
    await Promise.all([
      enabled && orgMatch
        ? checkWazuhIndexerHealth()
        : Promise.resolve({ ok: false, error: "Not configured" }),
      enabled && orgMatch
        ? checkWazuhManagerHealth()
        : Promise.resolve({ ok: false, error: "Not configured" }),
      prisma.wazuhIngestionState.findUnique({ where: { organizationId } }),
      prisma.wazuhProcessedAlert.count({
        where: { organizationId, createdAt: { gte: since24h } },
      }),
      prisma.securityEvent.count({
        where: {
          organizationId,
          source: "WAZUH",
          createdAt: { gte: since24h },
        },
      }),
      prisma.wazuhProcessedAlert.count({
        where: {
          organizationId,
          createdAt: { gte: since24h },
          disposition: "EVENT_CORRELATED",
        },
      }),
      prisma.wazuhProcessedAlert.count({
        where: {
          organizationId,
          createdAt: { gte: since24h },
          disposition: {
            in: ["FILTERED_LEVEL", "FILTERED_DENYLIST", "FILTERED_ALLOWLIST"],
          },
        },
      }),
      prisma.wazuhProcessedAlert.count({
        where: {
          organizationId,
          createdAt: { gte: since24h },
          disposition: "FILTERED_DENYLIST",
        },
      }),
    ]);

  const autoSyncEnabled = serverEnv.WAZUH_AUTO_SYNC_ENABLED;
  const syncIntervalSeconds = serverEnv.WAZUH_SYNC_INTERVAL_SECONDS;
  const heartbeat = state?.workerLastHeartbeatAt ?? null;
  let workerStatus: WazuhIntegrationStatus["workerStatus"] = "not_detected";
  if (heartbeat) {
    const age = Date.now() - heartbeat.getTime();
    workerStatus =
      age <= WAZUH_WORKER_STALE_MS ? "running" : "stale";
  }

  let nextExpectedSyncAt: string | null = null;
  if (autoSyncEnabled && heartbeat && workerStatus === "running") {
    nextExpectedSyncAt = new Date(
      heartbeat.getTime() + syncIntervalSeconds * 1000
    ).toISOString();
  }

  return {
    enabled: enabled && orgMatch,
    configuredOrganizationId: configuredOrg,
    organizationMatches: orgMatch,
    indexerConnected: indexer.ok,
    managerConnected: manager.ok,
    indexerStatus: "status" in indexer ? indexer.status : undefined,
    checkpointInitialized: Boolean(state?.lastTimestamp),
    checkpointTimestamp: state?.lastTimestamp?.toISOString() ?? null,
    lastSuccessfulSyncAt: state?.lastSuccessfulSyncAt?.toISOString() ?? null,
    lastAttemptAt: state?.lastAttemptAt?.toISOString() ?? null,
    lastError: state?.lastError ?? indexer.error ?? manager.error ?? null,
    autoSyncEnabled,
    syncIntervalSeconds,
    minEventLevel: serverEnv.WAZUH_MIN_EVENT_LEVEL,
    workerStatus,
    workerId: state?.workerId ?? null,
    workerLastHeartbeatAt: heartbeat?.toISOString() ?? null,
    lastSyncDurationMs: state?.lastSyncDurationMs ?? null,
    lastSyncProcessed: state?.lastSyncProcessed ?? null,
    lastSyncCreated: state?.lastSyncCreated ?? null,
    lastSyncUpdated: state?.lastSyncUpdated ?? null,
    lastSyncFiltered: state?.lastSyncFiltered ?? null,
    lastSyncIgnored: state?.lastSyncIgnored ?? null,
    lastSyncSkippedDuplicates: state?.lastSyncSkippedDuplicates ?? null,
    lastSyncErrors: state?.lastSyncErrors ?? null,
    processedLast24h,
    createdLast24h,
    correlatedLast24h,
    filteredLast24h,
    ignoredLast24h,
    nextExpectedSyncAt,
  };
}
