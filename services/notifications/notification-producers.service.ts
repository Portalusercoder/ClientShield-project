/**
 * Immediate in-app notification producers (Phases 4b + 6b5).
 *
 * Never invoked from page loads / list reads.
 * Prefer calling after domain mutations at existing service boundaries.
 * Do NOT duplicate timeline/activity entries — producers only store notifications.
 *
 * Assignment generation strategy:
 * - Incident: monotonic count of IncidentActivity rows with activityType=ASSIGNED
 * - Finding: monotonic count of AuditLog FINDING_ASSIGNED
 * - Investigation: monotonic count of InvestigationActivity ASSIGNED|REASSIGNED
 * Dedupe keys use generation so reassignment notifies without spam on retries.
 */
import type { NotificationSourceType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  createNotification,
  listAdminOwnerUserIds,
  listSocRecipientUserIds,
} from "@/services/notifications/notification.service";

type Db = typeof prisma | Prisma.TransactionClient;

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))];
}

export async function notifyCriticalIncidentCreated(input: {
  organizationId: string;
  incidentId: string;
  title: string;
  caseNumber: string | null;
  clientId: string | null;
  assetId: string | null;
}): Promise<{ created: boolean }> {
  const recipients = await listSocRecipientUserIds(input.organizationId);
  if (recipients.length === 0) return { created: false };

  const result = await createNotification({
    organizationId: input.organizationId,
    type: "INCIDENT_CREATED_CRITICAL",
    severity: "CRITICAL",
    title: `CRITICAL incident: ${input.title}`,
    message: input.caseNumber
      ? `A CRITICAL incident (${input.caseNumber}) was created.`
      : "A CRITICAL incident was created.",
    sourceType: "INCIDENT",
    sourceId: input.incidentId,
    clientId: input.clientId,
    assetId: input.assetId,
    dedupeKey: `incident:${input.incidentId}:critical-created`,
    href: `/incidents/${input.incidentId}`,
    recipientUserIds: recipients,
  });
  return { created: result.created };
}

export async function notifyIncidentAssigned(input: {
  organizationId: string;
  incidentId: string;
  title: string;
  assigneeUserId: string;
  clientId: string | null;
  assetId: string | null;
  /** Assignment generation — count of ASSIGNED activities after write. */
  assignmentGeneration: number;
  db?: Db;
}): Promise<{ created: boolean }> {
  const result = await createNotification(
    {
      organizationId: input.organizationId,
      type: "INCIDENT_ASSIGNED",
      severity: "INFO",
      title: `Incident assigned: ${input.title}`,
      message: "You were assigned to an incident.",
      sourceType: "INCIDENT",
      sourceId: input.incidentId,
      clientId: input.clientId,
      assetId: input.assetId,
      dedupeKey: `incident:${input.incidentId}:assigned:${input.assigneeUserId}:g${input.assignmentGeneration}`,
      href: `/incidents/${input.incidentId}`,
      recipientUserIds: [input.assigneeUserId],
    },
    input.db ?? prisma
  );
  return { created: result.created };
}

export async function notifyIncidentResolved(input: {
  organizationId: string;
  incidentId: string;
  title: string;
  actorId: string;
  assigneeUserId: string | null;
  leadAnalystUserId: string | null;
  commanderUserId: string | null;
  clientId: string | null;
  assetId: string | null;
}): Promise<{ created: boolean }> {
  const recipients = uniqueIds([
    input.assigneeUserId,
    input.leadAnalystUserId,
    input.commanderUserId,
  ]).filter((id) => id !== input.actorId);

  if (recipients.length === 0) return { created: false };

  const result = await createNotification({
    organizationId: input.organizationId,
    type: "INCIDENT_RESOLVED",
    severity: "INFO",
    title: `Incident resolved: ${input.title}`,
    message: "An incident you are involved with was marked resolved.",
    sourceType: "INCIDENT",
    sourceId: input.incidentId,
    clientId: input.clientId,
    assetId: input.assetId,
    dedupeKey: `incident:${input.incidentId}:resolved`,
    href: `/incidents/${input.incidentId}`,
    recipientUserIds: recipients,
  });
  return { created: result.created };
}

export async function notifyFindingAssigned(input: {
  organizationId: string;
  findingId: string;
  title: string;
  assigneeUserId: string;
  clientId: string | null;
  assetId: string | null;
  /** Assignment generation — count of FINDING_ASSIGNED audit logs after write. */
  assignmentGeneration: number;
}): Promise<{ created: boolean }> {
  const result = await createNotification({
    organizationId: input.organizationId,
    type: "FINDING_ASSIGNED",
    severity: "INFO",
    title: `Finding assigned: ${input.title}`,
    message: "You were assigned to a finding.",
    sourceType: "FINDING",
    sourceId: input.findingId,
    clientId: input.clientId,
    assetId: input.assetId,
    dedupeKey: `finding:${input.findingId}:assigned:${input.assigneeUserId}:g${input.assignmentGeneration}`,
    href: `/vulnerabilities/${input.findingId}`,
    recipientUserIds: [input.assigneeUserId],
  });
  return { created: result.created };
}

export async function notifyFindingCreated(input: {
  organizationId: string;
  findingId: string;
  title: string;
  actorId: string;
  assigneeUserId: string | null;
  investigationId: string | null;
  clientId: string | null;
  assetId: string | null;
}): Promise<{ created: boolean }> {
  const recipients = uniqueIds([input.assigneeUserId]).filter(
    (id) => id !== input.actorId
  );
  if (recipients.length === 0) return { created: false };

  const result = await createNotification({
    organizationId: input.organizationId,
    type: "FINDING_CREATED",
    severity: "INFO",
    title: `Finding created: ${input.title}`,
    message: input.investigationId
      ? "A finding was created from an investigation and assigned to you."
      : "A finding was created and assigned to you.",
    sourceType: "FINDING",
    sourceId: input.findingId,
    clientId: input.clientId,
    assetId: input.assetId,
    dedupeKey: `finding:${input.findingId}:created`,
    href: `/vulnerabilities/${input.findingId}`,
    recipientUserIds: recipients,
  });
  return { created: result.created };
}

export async function notifyInvestigationConfirmed(input: {
  organizationId: string;
  investigationId: string;
  title: string;
  confirmingActorId: string;
  createdByUserId: string | null;
  clientId: string | null;
  assetId: string | null;
}): Promise<{ created: boolean }> {
  const adminOwners = await listAdminOwnerUserIds(input.organizationId);
  const recipients = uniqueIds([
    ...adminOwners,
    input.createdByUserId,
  ]).filter((id) => id !== input.confirmingActorId);

  if (recipients.length === 0) return { created: false };

  const result = await createNotification({
    organizationId: input.organizationId,
    type: "INVESTIGATION_CONFIRMED",
    severity: "WARNING",
    title: `Investigation confirmed: ${input.title}`,
    message: "An investigation was confirmed by an analyst.",
    sourceType: "INVESTIGATION",
    sourceId: input.investigationId,
    clientId: input.clientId,
    assetId: input.assetId,
    dedupeKey: `investigation:${input.investigationId}:confirmed`,
    href: `/investigations/${input.investigationId}`,
    recipientUserIds: recipients,
  });
  return { created: result.created };
}

export async function notifyInvestigationAssigned(input: {
  organizationId: string;
  investigationId: string;
  title: string;
  assigneeUserId: string;
  actorId: string;
  clientId: string | null;
  assetId: string | null;
  assignmentGeneration: number;
}): Promise<{ created: boolean }> {
  if (input.assigneeUserId === input.actorId) {
    // Still notify self-assignment for consistency with incident/finding.
  }

  const result = await createNotification({
    organizationId: input.organizationId,
    type: "INVESTIGATION_ASSIGNED",
    severity: "INFO",
    title: `Investigation assigned: ${input.title}`,
    message: "You were assigned to an investigation.",
    sourceType: "INVESTIGATION",
    sourceId: input.investigationId,
    clientId: input.clientId,
    assetId: input.assetId,
    dedupeKey: `investigation:${input.investigationId}:assigned:${input.assigneeUserId}:g${input.assignmentGeneration}`,
    href: `/investigations/${input.investigationId}`,
    recipientUserIds: [input.assigneeUserId],
  });
  return { created: result.created };
}

export async function notifyInvestigationReopened(input: {
  organizationId: string;
  investigationId: string;
  title: string;
  actorId: string;
  assigneeUserId: string | null;
  createdByUserId: string | null;
  clientId: string | null;
  assetId: string | null;
  reopenGeneration: number;
}): Promise<{ created: boolean }> {
  const adminOwners = await listAdminOwnerUserIds(input.organizationId);
  const recipients = uniqueIds([
    ...adminOwners,
    input.assigneeUserId,
    input.createdByUserId,
  ]).filter((id) => id !== input.actorId);

  if (recipients.length === 0) return { created: false };

  const result = await createNotification({
    organizationId: input.organizationId,
    type: "INVESTIGATION_REOPENED",
    severity: "WARNING",
    title: `Investigation reopened: ${input.title}`,
    message: "An investigation was reopened and may need attention.",
    sourceType: "INVESTIGATION",
    sourceId: input.investigationId,
    clientId: input.clientId,
    assetId: input.assetId,
    dedupeKey: `investigation:${input.investigationId}:reopened:g${input.reopenGeneration}`,
    href: `/investigations/${input.investigationId}`,
    recipientUserIds: recipients,
  });
  return { created: result.created };
}

export async function notifyClaimTransferred(input: {
  organizationId: string;
  sourceType: NotificationSourceType;
  sourceId: string;
  title: string;
  actorId: string;
  previousHolderUserId: string | null;
  newHolderUserId: string;
  href: string;
  /** Monotonic generation for idempotent dedupe (e.g. claim event count). */
  transferGeneration: number;
  clientId?: string | null;
  assetId?: string | null;
}): Promise<{ created: boolean }> {
  const recipients = uniqueIds([
    input.newHolderUserId,
    input.previousHolderUserId,
  ]).filter((id) => id !== input.actorId);

  if (recipients.length === 0) {
    // Self-transfer with no previous holder → nothing to notify
    return { created: false };
  }

  const result = await createNotification({
    organizationId: input.organizationId,
    type: "CLAIM_TRANSFERRED",
    severity: "INFO",
    title: `Claim transferred: ${input.title}`,
    message: recipients.includes(input.newHolderUserId)
      ? "An Attention claim was transferred to you."
      : "An Attention claim you held was transferred.",
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    clientId: input.clientId ?? null,
    assetId: input.assetId ?? null,
    dedupeKey: `claim:${input.sourceType}:${input.sourceId}:to:${input.newHolderUserId}:g${input.transferGeneration}`,
    href: input.href,
    recipientUserIds: recipients,
  });
  return { created: result.created };
}

export async function countIncidentAssignmentGeneration(
  organizationId: string,
  incidentId: string,
  db: Db = prisma
): Promise<number> {
  return db.incidentActivity.count({
    where: {
      organizationId,
      incidentId,
      activityType: "ASSIGNED",
    },
  });
}

export async function countFindingAssignmentGeneration(
  organizationId: string,
  findingId: string
): Promise<number> {
  return prisma.auditLog.count({
    where: {
      organizationId,
      resourceType: "Finding",
      resourceId: findingId,
      action: "FINDING_ASSIGNED",
    },
  });
}

export async function countInvestigationAssignmentGeneration(
  organizationId: string,
  groupId: string
): Promise<number> {
  return prisma.investigationActivity.count({
    where: {
      organizationId,
      groupId,
      activityType: { in: ["ASSIGNED", "REASSIGNED"] },
    },
  });
}

export async function countInvestigationReopenGeneration(
  organizationId: string,
  groupId: string
): Promise<number> {
  return prisma.investigationActivity.count({
    where: {
      organizationId,
      groupId,
      activityType: "REOPENED",
    },
  });
}
