import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { WAZUH_WORKER_STALE_MS } from "@/lib/wazuh/constants";
import type { SecurityEventFiltersInput } from "@/lib/validations/security-events";
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
import { getSecurityEventInvestigationHandoff } from "@/services/investigations/se-investigation-handoff.service";
import { getAttentionOwnershipSnapshot } from "@/services/attention/attention-state.service";
import { ACTIVE_STATUSES } from "@/services/security-events/shared";

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

  const [agentMapping, linkableIncidents, investigationHandoff, ownershipSnap] =
    await Promise.all([
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
      getSecurityEventInvestigationHandoff(organizationId, id),
      getAttentionOwnershipSnapshot({
        organizationId,
        sourceType: "SECURITY_EVENT",
        sourceId: id,
      }),
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
    investigationHandoff,
    ownership: {
      inAttentionQueue: ownershipSnap.eligible,
      acknowledgedAt: ownershipSnap.acknowledgedAt,
      acknowledgedByName: ownershipSnap.acknowledgedByName,
      claimedByUserId: ownershipSnap.claimedByUserId,
      claimedByName: ownershipSnap.claimedByName,
      claimedAt: ownershipSnap.claimedAt,
    },
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
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
      prisma.securityEvent.count({
        where: {
          organizationId,
          source: "WAZUH",
          classification: "IGNORED",
          lastSeenAt: { gte: since24h },
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
    checkpointDocumentId: state?.lastDocumentId ?? null,
    lastSuccessfulSyncAt: state?.lastSuccessfulSyncAt?.toISOString() ?? null,
    lastFailedSyncAt: state?.lastFailedSyncAt?.toISOString() ?? null,
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
    lastSyncSkippedMalformed: state?.lastSyncSkippedMalformed ?? null,
    lastSyncErrors: state?.lastSyncErrors ?? null,
    lastSyncRetries: state?.lastSyncRetries ?? null,
    processedLast24h,
    createdLast24h,
    correlatedLast24h,
    filteredLast24h,
    ignoredLast24h,
    nextExpectedSyncAt,
  };
}
