import type { IncidentSeverity, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { computeQualityMetrics } from "@/services/investigations/investigation-quality.service";
import {
  ACTIVE_INVESTIGATION_STATUSES,
  IN_PROGRESS_FAMILY,
} from "@/services/investigations/status-transitions";
import type {
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

export function severityRank(s: IncidentSeverity): number {
  const order: Record<IncidentSeverity, number> = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    INFO: 1,
  };
  return order[s];
}

export function mapEventSeverityToIncident(
  s: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
): IncidentSeverity {
  return s;
}

export async function getGroupOrThrow(organizationId: string, groupId: string) {
  const group = await prisma.investigationGroup.findFirst({
    where: { id: groupId, organizationId },
  });
  if (!group) throw new Error("Investigation group not found");
  return group;
}

export async function refreshGroupMitre(
  organizationId: string,
  groupId: string
): Promise<void> {
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
      where: { organizationId, status: { in: IN_PROGRESS_FAMILY } },
    }),
    prisma.investigationGroup.count({
      where: { organizationId, status: "CONFIRMED" },
    }),
    prisma.investigationGroup.count({
      where: {
        organizationId,
        createdByType: "SYSTEM_SUGGESTED",
        status: { in: ACTIVE_INVESTIGATION_STATUSES },
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
      assignedTo: {
        select: { id: true, name: true, email: true },
      },
      closedBy: {
        select: { id: true, name: true, email: true },
      },
      reopenedBy: {
        select: { id: true, name: true, email: true },
      },
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
        take: 200,
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
      },
      notes: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, email: true } },
        },
      },
      correlationCandidates: {
        where: { status: "PENDING" },
        take: 50,
      },
    },
  });
  return group;
}
