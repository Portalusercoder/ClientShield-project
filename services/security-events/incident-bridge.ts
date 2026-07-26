import { assertMatchesTargetClient } from "@/lib/client-isolation";
import { prisma } from "@/lib/db";
import { sanitizeIncidentText } from "@/lib/incidents/sanitize";
import type {
  EscalateSecurityEventInput,
  LinkSecurityEventToIncidentInput,
} from "@/lib/validations/security-events";
import { createAuditLog } from "@/services/audit.service";
import { createIncident } from "@/services/incidents.service";
import { recordSecurityEventActivity } from "@/services/security-events/security-event-activity.service";
import {
  getEventOrThrow,
  mapEventSeverityToIncident,
} from "@/services/security-events/shared";

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

  assertMatchesTargetClient({
    sourceClientId: event.clientId,
    targetClientId: incident.clientId,
    context: "security event → incident",
  });

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
