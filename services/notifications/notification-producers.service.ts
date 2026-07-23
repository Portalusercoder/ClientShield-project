/**
 * Immediate in-app notification producers (Phase 4b).
 *
 * Never invoked from page loads / list reads.
 * Prefer calling after domain mutations at existing service boundaries.
 *
 * Assignment generation strategy:
 * - Incident: monotonic count of IncidentActivity rows with activityType=ASSIGNED
 *   for that incident (after the ASSIGNED activity is written).
 * - Finding: monotonic count of AuditLog rows with action=FINDING_ASSIGNED and
 *   resourceId=findingId in the organization (after the assign audit is written).
 * Dedupe keys:
 *   incident:{id}:assigned:{userId}:g{n}
 *   finding:{id}:assigned:{userId}:g{n}
 * Reassignment yields a new generation → new notification without spam on retries.
 * Self-assignment still notifies the assignee.
 */
import type { Prisma } from "@prisma/client";
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
