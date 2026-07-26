import type { IncidentSeverity, InvestigationStatus } from "@prisma/client";
import {
  assertCompatibleClientIds,
  assertMatchesTargetClient,
  assertUniformClientIds,
} from "@/lib/client-isolation";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/services/audit.service";
import { notifyInvestigationConfirmed } from "@/services/notifications/notification-producers.service";
import {
  escalateSecurityEventToIncident,
  linkSecurityEventToIncident,
} from "@/services/security-events.service";
import { appendInvestigationActivity } from "@/services/investigations/investigation-activity.service";
import {
  aggregateMitre,
  getGroupOrThrow,
  mapEventSeverityToIncident,
  refreshGroupMitre,
  severityRank,
} from "@/services/investigations/investigation-queries.service";
import { assertInvestigationTransition } from "@/services/investigations/status-transitions";
import type { CreateInvestigationInput } from "@/types/investigations";

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

  let assignedToUserId: string | null = null;
  if (input.data.assignedToUserId) {
    const assignee = await prisma.user.findFirst({
      where: {
        id: input.data.assignedToUserId,
        organizationId: input.organizationId,
        disabledAt: null,
      },
      select: { id: true },
    });
    if (!assignee) {
      throw new Error("Assignee not found in organization");
    }
    assignedToUserId = assignee.id;
  }

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
      assignedToUserId,
      assignedAt: assignedToUserId ? new Date() : null,
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
    metadata: {
      securityEventIds: eventIds,
      assignedToUserId,
    },
  });

  if (assignedToUserId) {
    await appendInvestigationActivity({
      organizationId: input.organizationId,
      groupId: group.id,
      actorUserId: input.actorId,
      activityType: "ASSIGNED",
      message: "Investigation assigned on create",
      metadata: { from: null, to: assignedToUserId },
    });
  }

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_CREATED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: {
      eventCount: events.length,
      assignedToUserId,
      securityEventIds: eventIds,
    },
  });

  const { logger, metrics, updateObservabilityContext, workflowCorrelationId } =
    await import("@/lib/observability");
  updateObservabilityContext({
    organizationId: input.organizationId,
    userId: input.actorId,
    investigationId: group.id,
    correlationId: workflowCorrelationId("inv", group.id),
  });
  metrics.inc("investigations_created");
  logger.info("investigation.created", {
    action: "createInvestigation",
    investigationId: group.id,
    eventCount: events.length,
    severity,
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

export async function startInvestigation(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
}) {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  // Prefer recommended IN_PROGRESS; keep INVESTIGATING readable via family helpers.
  assertInvestigationTransition(group.status, "IN_PROGRESS");
  const updated = await prisma.investigationGroup.update({
    where: { id: group.id },
    data: { status: "IN_PROGRESS" },
  });
  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "INVESTIGATION_STARTED",
    message: "Investigation started",
    metadata: { from: group.status, to: "IN_PROGRESS" },
  });
  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_STATUS_CHANGED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: { from: group.status, to: "IN_PROGRESS" },
  });
  return updated;
}

export async function confirmInvestigation(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
}) {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  assertInvestigationTransition(group.status, "CONFIRMED");
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
    metadata: { from: group.status, to: "CONFIRMED" },
  });
  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_STATUS_CHANGED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: { from: group.status, to: "CONFIRMED" },
  });

  await notifyInvestigationConfirmed({
    organizationId: input.organizationId,
    investigationId: group.id,
    title: group.title,
    confirmingActorId: input.actorId,
    createdByUserId: group.createdByUserId,
    clientId: group.clientId,
    assetId: group.assetId,
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
  assertInvestigationTransition(group.status, "DISMISSED");
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
    metadata: { from: group.status, to: "DISMISSED" },
  });
  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_STATUS_CHANGED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: { from: group.status, to: "DISMISSED" },
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

  if (group.status !== "LINKED_TO_INCIDENT") {
    assertInvestigationTransition(group.status, "LINKED_TO_INCIDENT");
    await prisma.investigationGroup.update({
      where: { id: group.id },
      data: { status: "LINKED_TO_INCIDENT" },
    });
  }

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "LINKED_TO_INCIDENT",
    message: `Linked to incident ${incident.caseNumber}`,
    metadata: {
      incidentId: incident.id,
      from: group.status,
      to: "LINKED_TO_INCIDENT",
    },
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

  if (group.status !== "LINKED_TO_INCIDENT") {
    assertInvestigationTransition(group.status, "LINKED_TO_INCIDENT");
    await prisma.investigationGroup.update({
      where: { id: group.id },
      data: { status: "LINKED_TO_INCIDENT" },
    });
  }

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "INCIDENT_CREATED",
    message: `Incident created from investigation`,
    metadata: {
      incidentId,
      from: group.status,
      to: "LINKED_TO_INCIDENT",
    },
  });

  return { incidentId };
}

export {
  aggregateMitre,
  buildGroupingExplanation,
  getInvestigationById,
  getInvestigationMetrics,
  getInvestigationObservables,
  listInvestigations,
} from "@/services/investigations/investigation-queries.service";
export {
  acceptCandidateIntoInvestigation,
  createSystemSuggestedGroup,
  suggestGroupsFromPendingCandidates,
} from "@/services/investigations/investigation-grouping.service";

export type { InvestigationStatus };
