import { prisma } from "@/lib/db";
import type { DismissSecurityEventInput } from "@/lib/validations/security-events";
import { createAuditLog } from "@/services/audit.service";
import { sanitizeFreeText } from "@/services/wazuh/wazuh-sanitizer.service";
import { recordSecurityEventActivity } from "@/services/security-events/security-event-activity.service";
import { getEventOrThrow } from "@/services/security-events/shared";

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
