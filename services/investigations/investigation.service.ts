import type {
  IncidentSeverity,
  InvestigationStatus,
  Prisma,
} from "@prisma/client";
import {
  areSameClientCohort,
  assertCompatibleClientIds,
  assertMatchesTargetClient,
  assertUniformClientIds,
  normalizeClientId,
} from "@/lib/client-isolation";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { createAuditLog } from "@/services/audit.service";
import {
  escalateSecurityEventToIncident,
  linkSecurityEventToIncident,
} from "@/services/security-events.service";
import { acceptCandidate } from "@/services/investigations/correlation.service";
import { appendInvestigationActivity } from "@/services/investigations/investigation-activity.service";
import {
  buildInvestigationFingerprint,
  computeQualityMetrics,
  evaluateSuggestionEligibility,
  loadQualityMetricsForGroup,
  qualitySummaryToJson,
  qualityWarningForMetrics,
  scoreInvestigationOverlap,
} from "@/services/investigations/investigation-quality.service";
import type {
  CreateInvestigationInput,
  InvestigationFilters,
  InvestigationListItem,
} from "@/types/investigations";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

export function buildGroupingExplanation(reasons: string[]): string {
  const unique = [...new Set(reasons.filter(Boolean))];
  if (unique.length === 0) {
    return "Related activity suggested by correlation signals.";
  }
  return unique.join("; ");
}

export function aggregateMitre(events: {
  mitreTactics: unknown;
  mitreTechniques: unknown;
}[]): { tactics: string[]; techniques: string[] } {
  const tactics = new Set<string>();
  const techniques = new Set<string>();
  for (const e of events) {
    for (const t of asStringArray(e.mitreTactics)) tactics.add(t);
    for (const t of asStringArray(e.mitreTechniques)) techniques.add(t);
  }
  return {
    tactics: [...tactics].sort(),
    techniques: [...techniques].sort(),
  };
}

function severityRank(s: IncidentSeverity): number {
  const order: Record<IncidentSeverity, number> = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    INFO: 1,
  };
  return order[s];
}

function mapEventSeverityToIncident(
  s: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
): IncidentSeverity {
  return s;
}

async function getGroupOrThrow(organizationId: string, groupId: string) {
  const group = await prisma.investigationGroup.findFirst({
    where: { id: groupId, organizationId },
  });
  if (!group) throw new Error("Investigation group not found");
  return group;
}

export async function listInvestigations(
  organizationId: string,
  filters: InvestigationFilters = {}
): Promise<{ items: InvestigationListItem[]; total: number }> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const where: Prisma.InvestigationGroupWhereInput = {
    organizationId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.createdByType
      ? { createdByType: filters.createdByType }
      : {}),
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.investigationGroup.count({ where }),
    prisma.investigationGroup.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        events: {
          where: { removedAt: null },
          select: {
            id: true,
            securityEvent: {
              select: {
                firstSeenAt: true,
                lastSeenAt: true,
                classification: true,
                ruleId: true,
                assetId: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    total,
    items: rows.map((r) => {
      const live = computeQualityMetrics(
        r.events.map((e) => e.securityEvent)
      );
      return {
        id: r.id,
        title: r.title,
        status: r.status,
        severity: r.severity,
        createdByType: r.createdByType,
        groupingExplanation: r.groupingExplanation,
        confidence: r.confidence,
        qualityWarning: r.qualityWarning,
        eventCount: live.eventCount,
        actionableEventCount: live.actionableEventCount,
        noisyEventCount: live.noisyEventCount,
        distinctRuleCount: live.distinctRuleCount,
        firstSeenAt: live.firstSeenAt,
        lastSeenAt: live.lastSeenAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    }),
  };
}

export async function getInvestigationMetrics(organizationId: string) {
  const tiReady =
    Boolean(serverEnv.THREAT_INTEL_ENABLED) &&
    Boolean(serverEnv.THREAT_INTEL_PROVIDER?.trim());

  const [
    open,
    investigating,
    confirmed,
    systemSuggestedOpen,
    linkedToIncident,
    total,
    maliciousIndicators,
  ] = await Promise.all([
    prisma.investigationGroup.count({
      where: { organizationId, status: "OPEN" },
    }),
    prisma.investigationGroup.count({
      where: { organizationId, status: "INVESTIGATING" },
    }),
    prisma.investigationGroup.count({
      where: { organizationId, status: "CONFIRMED" },
    }),
    prisma.investigationGroup.count({
      where: {
        organizationId,
        createdByType: "SYSTEM_SUGGESTED",
        status: { in: ["OPEN", "INVESTIGATING", "CONFIRMED"] },
      },
    }),
    prisma.investigationGroup.count({
      where: { organizationId, status: "LINKED_TO_INCIDENT" },
    }),
    prisma.investigationGroup.count({ where: { organizationId } }),
    tiReady
      ? prisma.threatIntelLookup.count({
          where: {
            organizationId,
            riskLevel: "MALICIOUS",
            status: "SUCCESS",
          },
        })
      : Promise.resolve(null),
  ]);

  return {
    open,
    investigating,
    confirmed,
    systemSuggestedOpen,
    linkedToIncident,
    total,
    maliciousIndicators,
  };
}

/**
 * Distinct observables linked to active events in an investigation group,
 * plus recent threat-intel lookups for those observables.
 */
export async function getInvestigationObservables(
  organizationId: string,
  groupId: string
) {
  const links = await prisma.investigationGroupEvent.findMany({
    where: { organizationId, groupId, removedAt: null },
    select: { securityEventId: true },
  });
  const eventIds = links.map((l) => l.securityEventId);
  if (eventIds.length === 0) {
    return { observables: [], lookups: [] };
  }

  const eventObs = await prisma.securityEventObservable.findMany({
    where: {
      organizationId,
      securityEventId: { in: eventIds },
    },
    include: {
      observable: {
        select: {
          id: true,
          type: true,
          value: true,
          normalizedValue: true,
          firstSeenAt: true,
          lastSeenAt: true,
        },
      },
    },
  });

  const byId = new Map<
    string,
    {
      id: string;
      type: (typeof eventObs)[number]["observable"]["type"];
      value: string;
      normalizedValue: string;
      firstSeenAt: Date;
      lastSeenAt: Date;
      roles: string[];
    }
  >();
  for (const row of eventObs) {
    const existing = byId.get(row.observable.id);
    if (existing) {
      if (!existing.roles.includes(row.role)) existing.roles.push(row.role);
      continue;
    }
    byId.set(row.observable.id, {
      id: row.observable.id,
      type: row.observable.type,
      value: row.observable.value,
      normalizedValue: row.observable.normalizedValue,
      firstSeenAt: row.observable.firstSeenAt,
      lastSeenAt: row.observable.lastSeenAt,
      roles: [row.role],
    });
  }

  const observables = [...byId.values()].sort((a, b) =>
    a.type === b.type
      ? a.value.localeCompare(b.value)
      : a.type.localeCompare(b.type)
  );

  const observableIds = observables.map((o) => o.id);
  const lookups =
    observableIds.length === 0
      ? []
      : await prisma.threatIntelLookup.findMany({
          where: {
            organizationId,
            observableId: { in: observableIds },
          },
          orderBy: { lookedUpAt: "desc" },
          take: 100,
          select: {
            id: true,
            observableId: true,
            provider: true,
            status: true,
            riskLevel: true,
            confidence: true,
            summary: true,
            lookedUpAt: true,
            expiresAt: true,
          },
        });

  return { observables, lookups };
}

export async function getInvestigationById(
  organizationId: string,
  groupId: string
) {
  const group = await prisma.investigationGroup.findFirst({
    where: { id: groupId, organizationId },
    include: {
      events: {
        where: { removedAt: null },
        include: {
          securityEvent: {
            select: {
              id: true,
              title: true,
              severity: true,
              status: true,
              agentName: true,
              assetId: true,
              clientId: true,
              firstSeenAt: true,
              lastSeenAt: true,
              mitreTactics: true,
              mitreTechniques: true,
            },
          },
        },
        orderBy: { addedAt: "asc" },
      },
      incidents: {
        include: {
          incident: {
            select: {
              id: true,
              caseNumber: true,
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
      },
      correlationCandidates: {
        where: { status: "PENDING" },
        take: 50,
      },
    },
  });
  return group;
}

export async function createInvestigation(input: {
  organizationId: string;
  actorId: string;
  data: CreateInvestigationInput;
}) {
  const eventIds = [...new Set(input.data.securityEventIds)];
  const events = await prisma.securityEvent.findMany({
    where: { organizationId: input.organizationId, id: { in: eventIds } },
  });
  if (events.length !== eventIds.length) {
    throw new Error("One or more security events not found in organization");
  }

  const clientId = assertUniformClientIds(
    events.map((e) => e.clientId),
    "investigation create"
  );

  const mitre = aggregateMitre(events);
  let severity: IncidentSeverity = input.data.severity ?? "MEDIUM";
  for (const e of events) {
    const mapped = mapEventSeverityToIncident(e.severity);
    if (severityRank(mapped) > severityRank(severity)) severity = mapped;
  }

  const assetId = events.find((e) => e.assetId)?.assetId ?? null;

  const group = await prisma.investigationGroup.create({
    data: {
      organizationId: input.organizationId,
      clientId,
      assetId,
      title: input.data.title.slice(0, 300),
      summary: input.data.summary?.slice(0, 5000) ?? null,
      severity,
      status: "OPEN",
      createdByType: "ANALYST_CREATED",
      createdByUserId: input.actorId,
      groupingExplanation:
        input.data.groupingExplanation?.slice(0, 5000) ??
        "Analyst-created investigation group.",
      mitreTactics: mitre.tactics,
      mitreTechniques: mitre.techniques,
      events: {
        create: events.map((e) => ({
          organizationId: input.organizationId,
          securityEventId: e.id,
          addedByUserId: input.actorId,
        })),
      },
    },
  });

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "CREATED",
    message: `Investigation created with ${events.length} event(s)`,
    metadata: { securityEventIds: eventIds },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_CREATED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: { eventCount: events.length },
  });

  return group;
}

/**
 * System-suggested group from a high-quality cluster.
 * Status remains OPEN — never auto-CONFIRMED.
 * Never auto-merges CONFIRMED or LINKED_TO_INCIDENT groups.
 */
export async function createSystemSuggestedGroup(input: {
  organizationId: string;
  eventIds: string[];
  reasons: string[];
  titleHint?: string | null;
  confidence?: "LOW" | "MEDIUM" | "HIGH" | null;
  signalFamilies?: string[];
  hasVeryStrongSignal?: boolean;
  strongSignals?: string[];
  supportingSignals?: string[];
}) {
  const eventIds = [...new Set(input.eventIds)];
  if (eventIds.length < 2) {
    throw new Error("System suggested group requires at least 2 events");
  }

  const events = await prisma.securityEvent.findMany({
    where: { organizationId: input.organizationId, id: { in: eventIds } },
    include: { asset: { select: { name: true } } },
  });
  if (events.length < 2) {
    throw new Error("Insufficient events for suggested group");
  }

  const proposedClientId = assertUniformClientIds(
    events.map((e) => e.clientId),
    "system suggested investigation"
  );

  const metrics = computeQualityMetrics(events);
  const eligibility = evaluateSuggestionEligibility({
    clusterConfidence: input.confidence ?? null,
    hasVeryStrongSignal: Boolean(input.hasVeryStrongSignal),
    metrics,
    signalFamilyCount: input.signalFamilies?.length ?? 0,
  });
  if (!eligibility.eligible) {
    throw new Error(
      `Suggestion threshold not met: ${eligibility.blockers.join("; ") || "quality gates failed"}`
    );
  }

  const fingerprint = buildInvestigationFingerprint({
    organizationId: input.organizationId,
    assetId: events.find((e) => e.assetId)?.assetId ?? null,
    ruleIds: events.map((e) => e.ruleId).filter(Boolean) as string[],
    strongObservableKeys: [],
    firstSeenAt: metrics.firstSeenAt,
  });

  // Only OPEN / INVESTIGATING SYSTEM_SUGGESTED may be updated — never CONFIRMED / LINKED
  const existingOpen = await prisma.investigationGroup.findMany({
    where: {
      organizationId: input.organizationId,
      createdByType: "SYSTEM_SUGGESTED",
      status: { in: ["OPEN", "INVESTIGATING"] },
      // Prefer same client scope before fingerprint/overlap matching
      ...(proposedClientId
        ? { clientId: proposedClientId }
        : { clientId: null }),
    },
    include: {
      events: {
        where: { removedAt: null },
        select: {
          securityEventId: true,
          securityEvent: {
            select: {
              firstSeenAt: true,
              lastSeenAt: true,
              clientId: true,
            },
          },
        },
      },
    },
    take: 50,
  });

  const targetSet = new Set(eventIds);
  const primaryAssetId = events.find((e) => e.assetId)?.assetId ?? null;

  for (const g of existingOpen) {
    const existingClientIds = g.events.map((e) => e.securityEvent.clientId);
    // Defense in depth: full resulting set must remain one client cohort
    try {
      assertUniformClientIds(
        [...existingClientIds, ...events.map((e) => e.clientId)],
        "system suggested investigation merge"
      );
    } catch {
      continue;
    }

    // Never touch confirmed / incident-linked (already filtered by status)
    if (g.fingerprint && g.fingerprint === fingerprint) {
      // expand below
    } else {
      const ids = g.events.map((e) => e.securityEventId);
      const overlap = scoreInvestigationOverlap({
        eventIdsA: ids,
        eventIdsB: eventIds,
        assetIdA: g.assetId,
        assetIdB: primaryAssetId,
        firstA: g.events[0]?.securityEvent.firstSeenAt ?? null,
        lastA:
          g.events.map((e) => e.securityEvent.lastSeenAt).sort((a, b) => +b - +a)[0] ??
          null,
        firstB: metrics.firstSeenAt,
        lastB: metrics.lastSeenAt,
      });
      const sameExact =
        ids.length === targetSet.size && ids.every((id) => targetSet.has(id));
      if (!sameExact && overlap.sharedEventRatio < 0.5 && g.fingerprint !== fingerprint) {
        continue;
      }
    }

    const ids = g.events.map((e) => e.securityEventId);
    for (const eid of eventIds) {
      if (ids.includes(eid)) continue;
      await prisma.investigationGroupEvent.upsert({
        where: {
          groupId_securityEventId: {
            groupId: g.id,
            securityEventId: eid,
          },
        },
        create: {
          organizationId: input.organizationId,
          groupId: g.id,
          securityEventId: eid,
          addReason: "Expanded from overlapping SYSTEM suggestion",
        },
        update: {
          removedAt: null,
          removeReason: null,
          addedAt: new Date(),
          addReason: "Expanded from overlapping SYSTEM suggestion",
        },
      });
    }
    await refreshGroupMitre(input.organizationId, g.id);
    const refreshedMetrics = await loadQualityMetricsForGroup(
      input.organizationId,
      g.id
    );
    const refreshedEligibility = evaluateSuggestionEligibility({
      clusterConfidence: input.confidence ?? g.confidence,
      hasVeryStrongSignal: Boolean(input.hasVeryStrongSignal),
      metrics: refreshedMetrics,
      signalFamilyCount: input.signalFamilies?.length ?? 0,
    });
    await prisma.investigationGroup.update({
      where: { id: g.id },
      data: {
        fingerprint,
        confidence: input.confidence ?? g.confidence,
        qualitySummary: qualitySummaryToJson(refreshedMetrics),
        qualityWarning: qualityWarningForMetrics(
          refreshedMetrics,
          refreshedEligibility
        ),
        groupingExplanation: buildGroupingExplanation([
          ...(input.reasons ?? []),
          ...(input.strongSignals ?? []),
        ]),
      },
    });
    return g;
  }

  const mitre = aggregateMitre(events);
  let severity: IncidentSeverity = "MEDIUM";
  for (const e of events) {
    const mapped = mapEventSeverityToIncident(e.severity);
    if (severityRank(mapped) > severityRank(severity)) severity = mapped;
  }

  const assetName =
    input.titleHint ||
    events.find((e) => e.asset?.name)?.asset?.name ||
    events.find((e) => e.agentName)?.agentName ||
    "multiple hosts";

  const explanationParts = [
    ...(input.strongSignals?.length
      ? [`Strong signals: ${input.strongSignals.join("; ")}`]
      : []),
    ...(input.supportingSignals?.length
      ? [`Supporting: ${input.supportingSignals.join("; ")}`]
      : []),
    ...input.reasons,
  ];

  const group = await prisma.investigationGroup.create({
    data: {
      organizationId: input.organizationId,
      clientId: proposedClientId,
      assetId: events.find((e) => e.assetId)?.assetId ?? null,
      title: `Potential related activity: ${assetName}`.slice(0, 300),
      status: "OPEN",
      severity,
      createdByType: "SYSTEM_SUGGESTED",
      confidence: input.confidence ?? null,
      fingerprint,
      qualitySummary: qualitySummaryToJson(metrics),
      qualityWarning: null,
      groupingExplanation: buildGroupingExplanation(explanationParts),
      mitreTactics: mitre.tactics,
      mitreTechniques: mitre.techniques,
      events: {
        create: events.map((e) => ({
          organizationId: input.organizationId,
          securityEventId: e.id,
          addReason: "SYSTEM_SUGGESTED correlation",
        })),
      },
    },
  });

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    activityType: "CREATED",
    message: `System suggested investigation group (${events.length} events)`,
    metadata: {
      securityEventIds: eventIds,
      reasons: input.reasons,
      eligibility: eligibility.reasons,
    },
  });

  return group;
}

export async function addEvent(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  securityEventId: string;
}) {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  if (group.status === "DISMISSED" || group.status === "CLOSED") {
    throw new Error("Cannot modify a dismissed or closed investigation");
  }

  const event = await prisma.securityEvent.findFirst({
    where: {
      id: input.securityEventId,
      organizationId: input.organizationId,
    },
  });
  if (!event) throw new Error("Security event not found");

  assertCompatibleClientIds({
    leftClientId: group.clientId,
    rightClientId: event.clientId,
    context: "investigation add event",
  });
  if (group.clientId && !event.clientId) {
    throw new Error(
      "Record must be attributed to a client before linking (investigation add event)"
    );
  }

  const existing = await prisma.investigationGroupEvent.findUnique({
    where: {
      groupId_securityEventId: {
        groupId: group.id,
        securityEventId: event.id,
      },
    },
  });

  if (existing && !existing.removedAt) {
    return existing;
  }

  const link = existing
    ? await prisma.investigationGroupEvent.update({
        where: { id: existing.id },
        data: {
          removedAt: null,
          removeReason: null,
          addedByUserId: input.actorId,
          addedAt: new Date(),
        },
      })
    : await prisma.investigationGroupEvent.create({
        data: {
          organizationId: input.organizationId,
          groupId: group.id,
          securityEventId: event.id,
          addedByUserId: input.actorId,
        },
      });

  await refreshGroupMitre(input.organizationId, group.id);

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "EVENT_ADDED",
    message: `Event added: ${event.title}`,
    metadata: { securityEventId: event.id },
  });

  return link;
}

export async function removeEvent(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  securityEventId: string;
  reason: string;
}) {
  if (!input.reason?.trim()) {
    throw new Error("Reason is required to remove an event");
  }
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  const link = await prisma.investigationGroupEvent.findUnique({
    where: {
      groupId_securityEventId: {
        groupId: group.id,
        securityEventId: input.securityEventId,
      },
    },
  });
  if (!link || link.removedAt) {
    throw new Error("Event is not in this investigation");
  }

  await prisma.investigationGroupEvent.update({
    where: { id: link.id },
    data: {
      removedAt: new Date(),
      removeReason: input.reason.slice(0, 2000),
    },
  });

  await refreshGroupMitre(input.organizationId, group.id);

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "EVENT_REMOVED",
    message: `Event removed from investigation`,
    note: input.reason,
    metadata: { securityEventId: input.securityEventId },
  });
}

async function refreshGroupMitre(organizationId: string, groupId: string) {
  const links = await prisma.investigationGroupEvent.findMany({
    where: { organizationId, groupId, removedAt: null },
    include: {
      securityEvent: {
        select: { mitreTactics: true, mitreTechniques: true },
      },
    },
  });
  const mitre = aggregateMitre(links.map((l) => l.securityEvent));
  await prisma.investigationGroup.update({
    where: { id: groupId },
    data: {
      mitreTactics: mitre.tactics,
      mitreTechniques: mitre.techniques,
    },
  });
}

export async function startInvestigation(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
}) {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  if (group.status === "DISMISSED" || group.status === "CLOSED") {
    throw new Error("Cannot start a dismissed or closed investigation");
  }
  const updated = await prisma.investigationGroup.update({
    where: { id: group.id },
    data: { status: "INVESTIGATING" },
  });
  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "INVESTIGATION_STARTED",
    message: "Investigation started",
  });
  return updated;
}

export async function confirmInvestigation(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
}) {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  if (group.status === "DISMISSED" || group.status === "CLOSED") {
    throw new Error("Cannot confirm a dismissed or closed investigation");
  }
  const updated = await prisma.investigationGroup.update({
    where: { id: group.id },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  });
  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "CONFIRMED",
    message: "Investigation confirmed by analyst",
  });
  return updated;
}

export async function dismissInvestigation(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  reason: string;
}) {
  if (!input.reason?.trim()) {
    throw new Error("Reason is required to dismiss an investigation");
  }
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  const updated = await prisma.investigationGroup.update({
    where: { id: group.id },
    data: {
      status: "DISMISSED",
      dismissedAt: new Date(),
      dismissReason: input.reason.slice(0, 2000),
    },
  });
  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "DISMISSED",
    message: "Investigation dismissed",
    note: input.reason,
  });
  return updated;
}

/**
 * Manually link an investigation group to an existing incident.
 * Does NOT auto-create incidents.
 */
export async function linkToIncident(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  incidentId: string;
}) {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  const incident = await prisma.incident.findFirst({
    where: { id: input.incidentId, organizationId: input.organizationId },
  });
  if (!incident) throw new Error("Incident not found");

  if (group.clientId) {
    assertMatchesTargetClient({
      sourceClientId: group.clientId,
      targetClientId: incident.clientId,
      context: "investigation → incident",
    });
  } else {
    assertCompatibleClientIds({
      leftClientId: group.clientId,
      rightClientId: incident.clientId,
      context: "investigation → incident",
    });
  }

  await prisma.investigationGroupIncident.upsert({
    where: {
      groupId_incidentId: {
        groupId: group.id,
        incidentId: incident.id,
      },
    },
    create: {
      organizationId: input.organizationId,
      groupId: group.id,
      incidentId: incident.id,
      linkedByUserId: input.actorId,
    },
    update: {},
  });

  // Link member events to the incident (manual escalate/link patterns)
  const links = await prisma.investigationGroupEvent.findMany({
    where: {
      organizationId: input.organizationId,
      groupId: group.id,
      removedAt: null,
    },
  });

  for (const link of links) {
    try {
      await linkSecurityEventToIncident({
        organizationId: input.organizationId,
        actorId: input.actorId,
        data: {
          securityEventId: link.securityEventId,
          incidentId: incident.id,
        },
      });
    } catch {
      // Already linked or other non-fatal — continue
    }
  }

  await prisma.investigationGroup.update({
    where: { id: group.id },
    data: { status: "LINKED_TO_INCIDENT" },
  });

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "LINKED_TO_INCIDENT",
    message: `Linked to incident ${incident.caseNumber}`,
    metadata: { incidentId: incident.id },
  });

  return { incidentId: incident.id };
}

/**
 * Manually create an incident from an investigation.
 * Confirmation must be enforced at the action layer (confirm: true).
 * Never called automatically from post-ingestion hooks.
 */
export async function createIncidentFromInvestigation(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  title?: string;
  description?: string;
  severity?: IncidentSeverity;
}) {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  const links = await prisma.investigationGroupEvent.findMany({
    where: {
      organizationId: input.organizationId,
      groupId: group.id,
      removedAt: null,
    },
    include: { securityEvent: true },
    orderBy: { addedAt: "asc" },
  });
  if (links.length === 0) {
    throw new Error("Investigation has no events to escalate");
  }

  const primary = links[0].securityEvent;
  if (!primary.clientId) {
    throw new Error(
      "Primary security event must be mapped to a client before incident creation"
    );
  }

  const { incidentId } = await escalateSecurityEventToIncident({
    organizationId: input.organizationId,
    actorId: input.actorId,
    eventId: primary.id,
    data: {
      title:
        input.title ??
        `Investigation: ${group.title}`.slice(0, 300),
      description:
        input.description ??
        `Created manually from investigation group ${group.id}. ${group.groupingExplanation ?? ""}`.slice(
          0,
          10000
        ),
      severity: input.severity ?? group.severity,
      category: "SUSPICIOUS_ACTIVITY",
      assetId: group.assetId ?? primary.assetId ?? undefined,
      assignedToUserId: undefined,
    },
  });

  // Link remaining events
  for (const link of links.slice(1)) {
    try {
      await linkSecurityEventToIncident({
        organizationId: input.organizationId,
        actorId: input.actorId,
        data: {
          securityEventId: link.securityEventId,
          incidentId,
        },
      });
    } catch {
      // continue
    }
  }

  await prisma.investigationGroupIncident.create({
    data: {
      organizationId: input.organizationId,
      groupId: group.id,
      incidentId,
      linkedByUserId: input.actorId,
    },
  });

  await prisma.investigationGroup.update({
    where: { id: group.id },
    data: { status: "LINKED_TO_INCIDENT" },
  });

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "INCIDENT_CREATED",
    message: `Incident created from investigation`,
    metadata: { incidentId },
  });

  return { incidentId };
}

/**
 * Suggest OPEN SYSTEM_SUGGESTED groups from PENDING candidates that meet
 * the investigation suggestion quality threshold.
 * Does NOT auto-confirm. Does NOT create incidents.
 */
export async function suggestGroupsFromPendingCandidates(
  organizationId: string
): Promise<{ suggested: number; skipped: number }> {
  const pendingRaw = await prisma.correlationCandidate.findMany({
    where: {
      organizationId,
      status: "PENDING",
      confidence: { in: ["HIGH", "MEDIUM"] },
    },
    orderBy: { score: "desc" },
    take: 100,
  });

  const eventIdSet = new Set<string>();
  for (const c of pendingRaw) {
    eventIdSet.add(c.eventAId);
    eventIdSet.add(c.eventBId);
  }
  const eventClientRows =
    eventIdSet.size === 0
      ? []
      : await prisma.securityEvent.findMany({
          where: { organizationId, id: { in: [...eventIdSet] } },
          select: { id: true, clientId: true },
        });
  const clientByEventId = new Map(
    eventClientRows.map((e) => [e.id, normalizeClientId(e.clientId)])
  );

  // Partition by client cohort before union-find so cross-client edges never merge
  const pending = pendingRaw.filter((c) =>
    areSameClientCohort(
      clientByEventId.get(c.eventAId),
      clientByEventId.get(c.eventBId)
    )
  );

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p !== x) {
      const root = find(p);
      parent.set(x, root);
      return root;
    }
    return x;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const reasonsByRoot = new Map<string, string[]>();
  const familiesByRoot = new Map<string, Set<string>>();
  const strongByRoot = new Map<string, string[]>();
  const supportingByRoot = new Map<string, string[]>();
  const maxConfByRoot = new Map<string, "LOW" | "MEDIUM" | "HIGH">();
  const hasVeryStrongByRoot = new Map<string, boolean>();

  for (const c of pending) {
    union(c.eventAId, c.eventBId);
  }
  for (const c of pending) {
    find(c.eventAId);
    find(c.eventBId);
  }

  const clusters = new Map<string, Set<string>>();
  for (const c of pending) {
    for (const id of [c.eventAId, c.eventBId]) {
      const root = find(id);
      if (!clusters.has(root)) clusters.set(root, new Set());
      clusters.get(root)!.add(id);
    }
    const root = find(c.eventAId);
    const reasons = Array.isArray(c.reasons)
      ? (c.reasons as unknown[]).filter((r): r is string => typeof r === "string")
      : [];
    reasonsByRoot.set(root, [...(reasonsByRoot.get(root) ?? []), ...reasons]);

    const families = Array.isArray(c.signalFamilies)
      ? (c.signalFamilies as unknown[]).filter(
          (r): r is string => typeof r === "string"
        )
      : [];
    if (!familiesByRoot.has(root)) familiesByRoot.set(root, new Set());
    for (const f of families) familiesByRoot.get(root)!.add(f);

    const qf = Array.isArray(c.qualityFactors)
      ? (c.qualityFactors as unknown[]).filter(
          (r): r is string => typeof r === "string"
        )
      : [];
    if (qf.some((x) => /VERY_STRONG|file hash|Shared file hash/i.test(x))) {
      hasVeryStrongByRoot.set(root, true);
    }
    if (reasons.some((r) => /Shared file hash/i.test(r))) {
      hasVeryStrongByRoot.set(root, true);
      strongByRoot.set(root, [
        ...(strongByRoot.get(root) ?? []),
        ...reasons.filter((r) => /hash|public source IP/i.test(r)),
      ]);
    }
    supportingByRoot.set(root, [
      ...(supportingByRoot.get(root) ?? []),
      ...reasons.filter((r) => /temporal|asset|agent|tactic|private/i.test(r)),
    ]);

    const prev = maxConfByRoot.get(root);
    if (
      !prev ||
      { LOW: 1, MEDIUM: 2, HIGH: 3 }[c.confidence] >
        { LOW: 1, MEDIUM: 2, HIGH: 3 }[prev]
    ) {
      maxConfByRoot.set(root, c.confidence);
    }
  }

  let suggested = 0;
  let skipped = 0;
  // Count filtered cross-cohort pending edges as skipped
  skipped += pendingRaw.length - pending.length;

  for (const [root, eventSet] of clusters) {
    if (eventSet.size < 2) {
      skipped += 1;
      continue;
    }
    const eventIds = [...eventSet];
    // Defense in depth: refuse mixed-cohort clusters even if an edge slipped through
    const cohortIds = eventIds.map((id) => clientByEventId.get(id) ?? null);
    try {
      assertUniformClientIds(cohortIds, "suggest groups from pending");
    } catch {
      skipped += 1;
      continue;
    }

    const events = await prisma.securityEvent.findMany({
      where: { organizationId, id: { in: eventIds } },
    });
    const metrics = computeQualityMetrics(events);
    const families = [...(familiesByRoot.get(root) ?? [])];
    const eligibility = evaluateSuggestionEligibility({
      clusterConfidence: maxConfByRoot.get(root) ?? null,
      hasVeryStrongSignal: Boolean(hasVeryStrongByRoot.get(root)),
      metrics: {
        ...metrics,
        signalFamilyCount: families.filter(
          (f) => f !== "TEMPORAL" && f !== "ASSET_CONTEXT"
        ).length,
      },
      signalFamilyCount: families.filter(
        (f) => f !== "TEMPORAL" && f !== "ASSET_CONTEXT"
      ).length,
    });

    if (!eligibility.eligible) {
      skipped += 1;
      continue;
    }

    const reasons = reasonsByRoot.get(root) ?? [];
    try {
      const group = await createSystemSuggestedGroup({
        organizationId,
        eventIds,
        reasons,
        confidence: maxConfByRoot.get(root) ?? null,
        signalFamilies: families,
        hasVeryStrongSignal: Boolean(hasVeryStrongByRoot.get(root)),
        strongSignals: [...new Set(strongByRoot.get(root) ?? [])],
        supportingSignals: [...new Set(supportingByRoot.get(root) ?? [])],
      });
      await prisma.correlationCandidate.updateMany({
        where: {
          organizationId,
          status: "PENDING",
          OR: [{ eventAId: { in: eventIds }, eventBId: { in: eventIds } }],
        },
        data: { investigationGroupId: group.id },
      });
      suggested += 1;
    } catch (error) {
      skipped += 1;
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          service: "investigation.service",
          message: "suggestGroupsFromPendingCandidates cluster skipped",
          error:
            error instanceof Error ? error.message.slice(0, 200) : "unknown",
        })
      );
    }
  }

  return { suggested, skipped };
}

/**
 * Accept a candidate and ensure both events are in an investigation group.
 */
export async function acceptCandidateIntoInvestigation(input: {
  organizationId: string;
  actorId: string;
  candidateId: string;
}) {
  const candidate = await prisma.correlationCandidate.findFirst({
    where: { id: input.candidateId, organizationId: input.organizationId },
  });
  if (!candidate) throw new Error("Correlation candidate not found");

  let groupId = candidate.investigationGroupId;
  if (!groupId) {
    const reasons = Array.isArray(candidate.reasons)
      ? (candidate.reasons as unknown[]).filter(
          (r): r is string => typeof r === "string"
        )
      : [];
    const group = await createSystemSuggestedGroup({
      organizationId: input.organizationId,
      eventIds: [candidate.eventAId, candidate.eventBId],
      reasons,
    });
    groupId = group.id;
  } else {
    await addEvent({
      organizationId: input.organizationId,
      actorId: input.actorId,
      groupId,
      securityEventId: candidate.eventAId,
    });
    await addEvent({
      organizationId: input.organizationId,
      actorId: input.actorId,
      groupId,
      securityEventId: candidate.eventBId,
    });
  }

  await acceptCandidate({
    organizationId: input.organizationId,
    actorId: input.actorId,
    candidateId: candidate.id,
    investigationGroupId: groupId,
  });

  return { investigationGroupId: groupId };
}

export type { InvestigationStatus };
