import type { IncidentSeverity, InvestigationStatus } from "@prisma/client";
import { assertCompatibleClientIds } from "@/lib/client-isolation";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/services/audit.service";
import {
  rejectCandidate,
} from "@/services/investigations/correlation.service";
import {
  acceptCandidateIntoInvestigation,
  addEvent,
  createInvestigation,
} from "@/services/investigations/investigation.service";
import { recordSecurityEventActivity } from "@/services/security-events/security-event-activity.service";
import type {
  SecurityEventInvestigationHandoff,
  SecurityEventInvestigationLink,
  SecurityEventInvestigationSuggestion,
} from "@/types/security-events";

export type {
  SecurityEventInvestigationHandoff,
  SecurityEventInvestigationLink,
  SecurityEventInvestigationSuggestion,
};

const LINKABLE_STATUSES: InvestigationStatus[] = [
  "OPEN",
  "INVESTIGATING",
  "CONFIRMED",
  "LINKED_TO_INCIDENT",
];

const TERMINAL_STATUSES: InvestigationStatus[] = ["DISMISSED", "CLOSED"];

function mapEventSeverityToIncident(
  severity: string
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
    default:
      return "INFO";
  }
}

async function getAttentionClaimOwner(
  organizationId: string,
  securityEventId: string
): Promise<{ userId: string; name: string } | null> {
  const claim = await prisma.socAttentionState.findFirst({
    where: {
      organizationId,
      sourceType: "SECURITY_EVENT",
      sourceId: securityEventId,
      claimedByUserId: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      claimedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!claim?.claimedByUserId || !claim.claimedBy) return null;
  return {
    userId: claim.claimedByUserId,
    name: claim.claimedBy.name ?? claim.claimedBy.email,
  };
}

/**
 * Load SE ↔ Investigation handoff context for the detail page.
 */
export async function getSecurityEventInvestigationHandoff(
  organizationId: string,
  securityEventId: string
): Promise<SecurityEventInvestigationHandoff | null> {
  const event = await prisma.securityEvent.findFirst({
    where: { id: securityEventId, organizationId },
    select: {
      id: true,
      title: true,
      summary: true,
      severity: true,
      clientId: true,
    },
  });
  if (!event) return null;

  const [memberships, candidates, suggestedOwner] = await Promise.all([
    prisma.investigationGroupEvent.findMany({
      where: {
        organizationId,
        securityEventId,
        removedAt: null,
      },
      include: {
        group: {
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
            _count: {
              select: {
                events: { where: { removedAt: null } },
              },
            },
          },
        },
      },
      orderBy: { addedAt: "desc" },
    }),
    prisma.correlationCandidate.findMany({
      where: {
        organizationId,
        status: "PENDING",
        OR: [{ eventAId: securityEventId }, { eventBId: securityEventId }],
      },
      orderBy: { score: "desc" },
      take: 20,
      include: {
        investigationGroup: { select: { id: true, title: true } },
      },
    }),
    getAttentionClaimOwner(organizationId, securityEventId),
  ]);

  const linkedIds = new Set(memberships.map((m) => m.groupId));
  const linked: SecurityEventInvestigationLink[] = memberships.map((m) => ({
    id: m.group.id,
    title: m.group.title,
    status: m.group.status,
    severity: m.group.severity,
    createdByType: m.group.createdByType,
    assignedToUserId: m.group.assignedToUserId,
    assignedToName:
      m.group.assignedTo?.name ?? m.group.assignedTo?.email ?? null,
    eventCount: m.group._count.events,
    alreadyLinked: true,
  }));

  const linkableWhere = {
    organizationId,
    status: { in: LINKABLE_STATUSES },
    id: { notIn: [...linkedIds] },
    ...(event.clientId
      ? { OR: [{ clientId: event.clientId }, { clientId: null }] }
      : { clientId: null }),
  };

  const linkableRows = await prisma.investigationGroup.findMany({
    where: linkableWhere,
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      _count: { select: { events: { where: { removedAt: null } } } },
    },
  });

  const linkable: SecurityEventInvestigationLink[] = linkableRows.map((g) => ({
    id: g.id,
    title: g.title,
    status: g.status,
    severity: g.severity,
    createdByType: g.createdByType,
    assignedToUserId: g.assignedToUserId,
    assignedToName: g.assignedTo?.name ?? g.assignedTo?.email ?? null,
    eventCount: g._count.events,
    alreadyLinked: false,
  }));

  const otherEventIds = [
    ...new Set(
      candidates.map((c) =>
        c.eventAId === securityEventId ? c.eventBId : c.eventAId
      )
    ),
  ];
  const otherEvents = otherEventIds.length
    ? await prisma.securityEvent.findMany({
        where: { organizationId, id: { in: otherEventIds } },
        select: { id: true, title: true },
      })
    : [];
  const otherTitleById = new Map(otherEvents.map((e) => [e.id, e.title]));

  const suggestions: SecurityEventInvestigationSuggestion[] = candidates.map(
    (c) => {
      const otherId = c.eventAId === securityEventId ? c.eventBId : c.eventAId;
      return {
        candidateId: c.id,
        score: c.score,
        confidence: c.confidence,
        reasons: Array.isArray(c.reasons)
          ? (c.reasons as unknown[]).filter(
              (r): r is string => typeof r === "string"
            )
          : [],
        otherEventId: otherId,
        otherEventTitle: otherTitleById.get(otherId) ?? otherId,
        investigationGroupId: c.investigationGroupId,
        investigationTitle: c.investigationGroup?.title ?? null,
      };
    }
  );

  let panelState: SecurityEventInvestigationHandoff["panelState"] = "NONE";
  if (linked.length > 1) panelState = "MULTIPLE";
  else if (linked.length === 1) panelState = "LINKED";
  else if (suggestions.length > 0) panelState = "SUGGESTED";

  return {
    linked,
    linkable,
    suggestions,
    createDefaults: {
      title: `Investigation: ${event.title}`.slice(0, 300),
      severity: mapEventSeverityToIncident(event.severity),
      summary: event.summary,
    },
    suggestedOwner,
    panelState,
  };
}

/**
 * Search linkable investigations for the SE link picker (no ID paste).
 */
export async function searchLinkableInvestigationsForSecurityEvent(input: {
  organizationId: string;
  securityEventId: string;
  query?: string;
}): Promise<SecurityEventInvestigationLink[]> {
  const handoff = await getSecurityEventInvestigationHandoff(
    input.organizationId,
    input.securityEventId
  );
  if (!handoff) return [];
  const q = input.query?.trim().toLowerCase() ?? "";
  if (!q) return handoff.linkable;
  return handoff.linkable.filter(
    (g) =>
      g.title.toLowerCase().includes(q) ||
      g.id.toLowerCase().includes(q) ||
      g.status.toLowerCase().includes(q)
  );
}

/**
 * Create an investigation from a Security Event (pre-populated; no ID paste).
 */
export async function createInvestigationFromSecurityEvent(input: {
  organizationId: string;
  actorId: string;
  securityEventId: string;
  title?: string;
  summary?: string | null;
  severity?: IncidentSeverity;
  /** When true and Attention claim exists, set investigation assignee. */
  inheritOwner?: boolean;
}): Promise<{ investigationId: string }> {
  const event = await prisma.securityEvent.findFirst({
    where: { id: input.securityEventId, organizationId: input.organizationId },
  });
  if (!event) throw new Error("Security event not found");

  const handoff = await getSecurityEventInvestigationHandoff(
    input.organizationId,
    input.securityEventId
  );
  if (!handoff) throw new Error("Security event not found");

  let assignedToUserId: string | undefined;
  if (input.inheritOwner && handoff.suggestedOwner) {
    assignedToUserId = handoff.suggestedOwner.userId;
  }

  const group = await createInvestigation({
    organizationId: input.organizationId,
    actorId: input.actorId,
    data: {
      title: (input.title ?? handoff.createDefaults.title).slice(0, 300),
      summary:
        input.summary !== undefined
          ? input.summary
          : handoff.createDefaults.summary,
      severity: input.severity ?? handoff.createDefaults.severity,
      securityEventIds: [event.id],
      groupingExplanation:
        "Created from Security Event detail (analyst handoff).",
      assignedToUserId,
    },
  });

  await recordSecurityEventActivity({
    organizationId: input.organizationId,
    securityEventId: event.id,
    actorUserId: input.actorId,
    activityType: "INVESTIGATION_CREATED",
    message: `Investigation created: ${group.title}`,
    metadata: {
      investigationId: group.id,
      inheritedOwner: Boolean(assignedToUserId),
      assignedToUserId: assignedToUserId ?? null,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "SECURITY_EVENT_INVESTIGATION_CREATED",
    resourceType: "SecurityEvent",
    resourceId: event.id,
    metadata: {
      investigationId: group.id,
      assignedToUserId: assignedToUserId ?? null,
      inheritOwner: Boolean(input.inheritOwner),
    },
  });

  return { investigationId: group.id };
}

/**
 * Link an existing investigation to this Security Event.
 */
export async function linkSecurityEventToInvestigation(input: {
  organizationId: string;
  actorId: string;
  securityEventId: string;
  investigationId: string;
  reason?: string;
}): Promise<{ investigationId: string }> {
  const event = await prisma.securityEvent.findFirst({
    where: { id: input.securityEventId, organizationId: input.organizationId },
  });
  if (!event) throw new Error("Security event not found");

  const group = await prisma.investigationGroup.findFirst({
    where: {
      id: input.investigationId,
      organizationId: input.organizationId,
    },
  });
  if (!group) throw new Error("Investigation not found");

  if (TERMINAL_STATUSES.includes(group.status)) {
    throw new Error(
      "Cannot link to a dismissed or closed investigation"
    );
  }

  assertCompatibleClientIds({
    leftClientId: group.clientId,
    rightClientId: event.clientId,
    context: "security event link investigation",
  });

  const existing = await prisma.investigationGroupEvent.findUnique({
    where: {
      groupId_securityEventId: {
        groupId: group.id,
        securityEventId: event.id,
      },
    },
  });
  if (existing && !existing.removedAt) {
    throw new Error("Security event is already linked to this investigation");
  }

  await addEvent({
    organizationId: input.organizationId,
    actorId: input.actorId,
    groupId: group.id,
    securityEventId: event.id,
  });

  await recordSecurityEventActivity({
    organizationId: input.organizationId,
    securityEventId: event.id,
    actorUserId: input.actorId,
    activityType: "INVESTIGATION_LINKED",
    message: `Linked to investigation: ${group.title}`,
    note: input.reason?.slice(0, 2000) ?? null,
    metadata: { investigationId: group.id },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "SECURITY_EVENT_INVESTIGATION_LINKED",
    resourceType: "SecurityEvent",
    resourceId: event.id,
    metadata: {
      investigationId: group.id,
      reason: input.reason?.slice(0, 500) ?? null,
    },
  });

  return { investigationId: group.id };
}

/**
 * Accept a SYSTEM / correlation suggestion involving this SE.
 * Never auto-confirms the investigation.
 */
export async function acceptInvestigationSuggestionForSecurityEvent(input: {
  organizationId: string;
  actorId: string;
  securityEventId: string;
  candidateId: string;
}): Promise<{ investigationId: string }> {
  const candidate = await prisma.correlationCandidate.findFirst({
    where: {
      id: input.candidateId,
      organizationId: input.organizationId,
      status: "PENDING",
      OR: [
        { eventAId: input.securityEventId },
        { eventBId: input.securityEventId },
      ],
    },
  });
  if (!candidate) {
    throw new Error("Suggestion not found for this security event");
  }

  const result = await acceptCandidateIntoInvestigation({
    organizationId: input.organizationId,
    actorId: input.actorId,
    candidateId: candidate.id,
  });

  // Ensure this SE is a live member (accept may have focused on both events).
  await addEvent({
    organizationId: input.organizationId,
    actorId: input.actorId,
    groupId: result.investigationGroupId,
    securityEventId: input.securityEventId,
  });

  await recordSecurityEventActivity({
    organizationId: input.organizationId,
    securityEventId: input.securityEventId,
    actorUserId: input.actorId,
    activityType: "INVESTIGATION_SUGGESTION_ACCEPTED",
    message: "Correlation suggestion accepted into investigation",
    metadata: {
      candidateId: candidate.id,
      investigationId: result.investigationGroupId,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "SECURITY_EVENT_INVESTIGATION_SUGGESTION_ACCEPTED",
    resourceType: "SecurityEvent",
    resourceId: input.securityEventId,
    metadata: {
      candidateId: candidate.id,
      investigationId: result.investigationGroupId,
    },
  });

  return { investigationId: result.investigationGroupId };
}

/**
 * Dismiss a correlation suggestion for this SE. Never auto-confirms.
 */
export async function dismissInvestigationSuggestionForSecurityEvent(input: {
  organizationId: string;
  actorId: string;
  securityEventId: string;
  candidateId: string;
  reason?: string;
}): Promise<void> {
  const candidate = await prisma.correlationCandidate.findFirst({
    where: {
      id: input.candidateId,
      organizationId: input.organizationId,
      status: "PENDING",
      OR: [
        { eventAId: input.securityEventId },
        { eventBId: input.securityEventId },
      ],
    },
  });
  if (!candidate) {
    throw new Error("Suggestion not found for this security event");
  }

  await rejectCandidate({
    organizationId: input.organizationId,
    actorId: input.actorId,
    candidateId: candidate.id,
    reason: input.reason,
  });

  await recordSecurityEventActivity({
    organizationId: input.organizationId,
    securityEventId: input.securityEventId,
    actorUserId: input.actorId,
    activityType: "INVESTIGATION_SUGGESTION_DISMISSED",
    message: "Correlation suggestion dismissed",
    note: input.reason?.slice(0, 2000) ?? null,
    metadata: { candidateId: candidate.id },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "SECURITY_EVENT_INVESTIGATION_SUGGESTION_DISMISSED",
    resourceType: "SecurityEvent",
    resourceId: input.securityEventId,
    metadata: {
      candidateId: candidate.id,
      reason: input.reason?.slice(0, 500) ?? null,
    },
  });
}
