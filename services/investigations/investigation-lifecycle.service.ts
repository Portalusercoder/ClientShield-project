import type { InvestigationActivityType, InvestigationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/services/audit.service";
import { appendInvestigationActivity } from "@/services/investigations/investigation-activity.service";
import {
  countInvestigationAssignmentGeneration,
  countInvestigationReopenGeneration,
  notifyInvestigationAssigned,
  notifyInvestigationReopened,
} from "@/services/notifications/notification-producers.service";
import {
  assertInvestigationTransition,
  canReopenInvestigation,
} from "@/services/investigations/status-transitions";

function trimRequired(value: string | null | undefined, label: string, max: number): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed.slice(0, max);
}

async function getGroupOrThrow(organizationId: string, groupId: string) {
  const group = await prisma.investigationGroup.findFirst({
    where: { id: groupId, organizationId },
  });
  if (!group) throw new Error("Investigation group not found");
  return group;
}

async function assertAssigneeInOrg(
  organizationId: string,
  userId: string
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId, disabledAt: null },
    select: { id: true },
  });
  if (!user) {
    throw new Error("Assignee not found in organization");
  }
}

function activityForStatusChange(
  to: InvestigationStatus
): InvestigationActivityType {
  switch (to) {
    case "INVESTIGATING":
    case "IN_PROGRESS":
      return "INVESTIGATION_STARTED";
    case "CONFIRMED":
      return "CONFIRMED";
    case "DISMISSED":
      return "DISMISSED";
    case "RESOLVED":
      return "RESOLVED";
    case "CLOSED":
      return "CLOSED";
    case "LINKED_TO_INCIDENT":
      return "LINKED_TO_INCIDENT";
    default:
      return "STATUS_CHANGED";
  }
}

/**
 * Generic status transition with validation + activity + audit.
 * Prefer dedicated helpers (close/reopen/start) for special fields.
 */
export async function transitionInvestigationStatus(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  toStatus: InvestigationStatus;
  note?: string | null;
}): Promise<void> {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  assertInvestigationTransition(group.status, input.toStatus);

  const data: {
    status: InvestigationStatus;
    confirmedAt?: Date;
    dismissedAt?: Date;
    dismissReason?: string;
  } = { status: input.toStatus };

  if (input.toStatus === "CONFIRMED") {
    data.confirmedAt = new Date();
  }
  if (input.toStatus === "DISMISSED") {
    data.dismissedAt = new Date();
    data.dismissReason = trimRequired(input.note, "Dismiss reason", 2000);
  }

  await prisma.investigationGroup.update({
    where: { id: group.id },
    data,
  });

  const activityType = activityForStatusChange(input.toStatus);
  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType,
    message: `Status changed: ${group.status} → ${input.toStatus}`,
    note: input.note?.trim() || null,
    metadata: { from: group.status, to: input.toStatus },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_STATUS_CHANGED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: {
      from: group.status,
      to: input.toStatus,
      note: input.note?.trim()?.slice(0, 200) ?? null,
    },
  });
}

export async function assignInvestigation(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  assignedToUserId: string | null;
}): Promise<void> {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);

  if (group.status === "CLOSED" || group.status === "DISMISSED") {
    throw new Error("Cannot assign a closed or dismissed investigation");
  }

  const next = input.assignedToUserId;
  if (next) {
    await assertAssigneeInOrg(input.organizationId, next);
  }

  if (group.assignedToUserId === next) {
    return;
  }

  const now = new Date();
  await prisma.investigationGroup.update({
    where: { id: group.id },
    data: {
      assignedToUserId: next,
      assignedAt: next ? now : null,
    },
  });

  let activityType: InvestigationActivityType = "ASSIGNED";
  let message = "Investigation assigned";
  if (!next) {
    activityType = "UNASSIGNED";
    message = "Investigation unassigned";
  } else if (group.assignedToUserId) {
    activityType = "REASSIGNED";
    message = "Investigation reassigned";
  }

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType,
    message,
    metadata: {
      from: group.assignedToUserId,
      to: next,
      assignedAt: next ? now.toISOString() : null,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_ASSIGNED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: {
      from: group.assignedToUserId,
      to: next,
    },
  });

  if (next) {
    const assignmentGeneration = await countInvestigationAssignmentGeneration(
      input.organizationId,
      group.id
    );
    await notifyInvestigationAssigned({
      organizationId: input.organizationId,
      investigationId: group.id,
      title: group.title,
      assigneeUserId: next,
      actorId: input.actorId,
      clientId: group.clientId,
      assetId: group.assetId,
      assignmentGeneration,
    });
  }
}

export async function addInvestigationNote(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  content: string;
}): Promise<{ id: string }> {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  if (group.status === "CLOSED" || group.status === "DISMISSED") {
    throw new Error("Cannot add notes to a closed or dismissed investigation");
  }

  const content = trimRequired(input.content, "Note content", 10000);

  const note = await prisma.investigationNote.create({
    data: {
      organizationId: input.organizationId,
      groupId: group.id,
      authorUserId: input.actorId,
      content,
    },
    select: { id: true },
  });

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "NOTE_ADDED",
    message: "Analyst note added",
    note: content.slice(0, 500),
    metadata: { noteId: note.id },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_NOTE_ADDED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: {
      noteId: note.id,
      contentPreview: content.slice(0, 120),
    },
  });

  return note;
}

export async function editInvestigationNote(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  noteId: string;
  content: string;
}): Promise<void> {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  if (group.status === "CLOSED" || group.status === "DISMISSED") {
    throw new Error("Cannot edit notes on a closed or dismissed investigation");
  }

  const content = trimRequired(input.content, "Note content", 10000);
  const existing = await prisma.investigationNote.findFirst({
    where: {
      id: input.noteId,
      groupId: group.id,
      organizationId: input.organizationId,
      deletedAt: null,
    },
  });
  if (!existing) throw new Error("Note not found");

  const editedAt = new Date();
  await prisma.investigationNote.update({
    where: { id: existing.id },
    data: { content, editedAt },
  });

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "NOTE_EDITED",
    message: "Analyst note edited",
    note: content.slice(0, 500),
    metadata: {
      noteId: existing.id,
      previousPreview: existing.content.slice(0, 120),
      editedAt: editedAt.toISOString(),
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_NOTE_EDITED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: {
      noteId: existing.id,
      contentPreview: content.slice(0, 120),
    },
  });
}

export async function softDeleteInvestigationNote(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  noteId: string;
}): Promise<void> {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  const existing = await prisma.investigationNote.findFirst({
    where: {
      id: input.noteId,
      groupId: group.id,
      organizationId: input.organizationId,
      deletedAt: null,
    },
  });
  if (!existing) throw new Error("Note not found");

  const deletedAt = new Date();
  await prisma.investigationNote.update({
    where: { id: existing.id },
    data: {
      deletedAt,
      deletedByUserId: input.actorId,
    },
  });

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "NOTE_DELETED",
    message: "Analyst note deleted",
    metadata: {
      noteId: existing.id,
      contentPreview: existing.content.slice(0, 120),
      deletedAt: deletedAt.toISOString(),
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_NOTE_DELETED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: { noteId: existing.id },
  });
}

export async function resolveInvestigation(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  resolutionSummary?: string | null;
}): Promise<void> {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  assertInvestigationTransition(group.status, "RESOLVED");

  const summary = input.resolutionSummary?.trim()
    ? input.resolutionSummary.trim().slice(0, 5000)
    : group.resolutionSummary;

  await prisma.investigationGroup.update({
    where: { id: group.id },
    data: {
      status: "RESOLVED",
      ...(summary ? { resolutionSummary: summary } : {}),
    },
  });

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "RESOLVED",
    message: `Status changed: ${group.status} → RESOLVED`,
    note: summary,
    metadata: { from: group.status, to: "RESOLVED" },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_RESOLVED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: {
      from: group.status,
      resolutionSummaryPreview: summary?.slice(0, 200) ?? null,
    },
  });
}

export async function closeInvestigation(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  resolutionSummary: string;
}): Promise<void> {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);

  if (group.status === "CLOSED") {
    throw new Error("Investigation is already closed");
  }

  assertInvestigationTransition(group.status, "CLOSED");

  const resolutionSummary = trimRequired(
    input.resolutionSummary,
    "Resolution summary",
    5000
  );
  const closedAt = new Date();

  await prisma.investigationGroup.update({
    where: { id: group.id },
    data: {
      status: "CLOSED",
      resolutionSummary,
      closedAt,
      closedByUserId: input.actorId,
    },
  });

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "CLOSED",
    message: `Investigation closed (was ${group.status})`,
    note: resolutionSummary,
    metadata: {
      from: group.status,
      to: "CLOSED",
      closedAt: closedAt.toISOString(),
      closedByUserId: input.actorId,
      resolutionSummary,
      previousClosedAt: group.closedAt?.toISOString() ?? null,
      previousResolutionSummary: group.resolutionSummary,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_CLOSED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: {
      from: group.status,
      closedAt: closedAt.toISOString(),
      resolutionSummaryPreview: resolutionSummary.slice(0, 200),
      previousClosedAt: group.closedAt?.toISOString() ?? null,
    },
  });
}

export async function reopenInvestigation(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  reason: string;
}): Promise<void> {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);

  if (!canReopenInvestigation(group.status)) {
    throw new Error(
      `Cannot reopen investigation in status ${group.status}. Allowed from: RESOLVED, CLOSED`
    );
  }

  if (group.status === "OPEN") {
    throw new Error("Cannot reopen an OPEN investigation");
  }

  assertInvestigationTransition(group.status, "IN_PROGRESS");
  const reason = trimRequired(input.reason, "Reopen reason", 2000);
  const reopenedAt = new Date();

  // Preserve prior closure fields (resolutionSummary / closedAt / closedByUserId).
  await prisma.investigationGroup.update({
    where: { id: group.id },
    data: {
      status: "IN_PROGRESS",
      reopenedAt,
      reopenedByUserId: input.actorId,
      lastReopenReason: reason,
    },
  });

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "REOPENED",
    message: `Investigation reopened (was ${group.status})`,
    note: reason,
    metadata: {
      from: group.status,
      to: "IN_PROGRESS",
      reason,
      reopenedAt: reopenedAt.toISOString(),
      preservedClosedAt: group.closedAt?.toISOString() ?? null,
      preservedResolutionSummary: group.resolutionSummary,
      preservedClosedByUserId: group.closedByUserId,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_REOPENED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: {
      from: group.status,
      to: "IN_PROGRESS",
      reason: reason.slice(0, 200),
      preservedClosedAt: group.closedAt?.toISOString() ?? null,
      preservedResolutionSummaryPreview:
        group.resolutionSummary?.slice(0, 200) ?? null,
    },
  });

  const reopenGeneration = await countInvestigationReopenGeneration(
    input.organizationId,
    group.id
  );
  await notifyInvestigationReopened({
    organizationId: input.organizationId,
    investigationId: group.id,
    title: group.title,
    actorId: input.actorId,
    assigneeUserId: group.assignedToUserId,
    createdByUserId: group.createdByUserId,
    clientId: group.clientId,
    assetId: group.assetId,
    reopenGeneration,
  });
}

export async function listInvestigationNotes(
  organizationId: string,
  groupId: string
) {
  return prisma.investigationNote.findMany({
    where: {
      organizationId,
      groupId,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true, email: true } },
    },
  });
}
