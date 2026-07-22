import type {
  PlaybookPhase,
  ResponseTaskPriority,
  ResponseTaskStatus,
  UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { sanitizeIncidentText } from "@/lib/incidents/sanitize";
import { createAuditLog } from "@/services/audit.service";
import { appendIncidentActivity } from "@/services/incidents/activity";

const ASSIGNABLE_ROLES: UserRole[] = ["ANALYST", "ADMIN", "OWNER"];

async function getIncidentOrThrow(organizationId: string, incidentId: string) {
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, organizationId },
    select: { id: true },
  });
  if (!incident) throw new Error("Incident not found");
  return incident;
}

async function assertAssigneeInOrg(
  organizationId: string,
  userId: string
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      organizationId,
      role: { in: ASSIGNABLE_ROLES },
    },
    select: { id: true },
  });
  if (!user) {
    throw new Error(
      "Assignee must be an ANALYST, ADMIN, or OWNER in this organization"
    );
  }
}

export async function listResponseTasks(
  organizationId: string,
  incidentId: string
) {
  await getIncidentOrThrow(organizationId, incidentId);
  return prisma.incidentResponseTask.findMany({
    where: { organizationId, incidentId },
    orderBy: [{ phase: "asc" }, { createdAt: "asc" }],
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      completedBy: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function createResponseTask(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  phase: PlaybookPhase;
  title: string;
  description?: string | null;
  priority?: ResponseTaskPriority;
  isRequired?: boolean;
  assignedToUserId?: string | null;
  dueAt?: Date | null;
}): Promise<{ id: string }> {
  await getIncidentOrThrow(input.organizationId, input.incidentId);
  if (input.assignedToUserId) {
    await assertAssigneeInOrg(input.organizationId, input.assignedToUserId);
  }

  const title = sanitizeIncidentText(input.title, 300) ?? input.title;
  const description = sanitizeIncidentText(input.description, 5000);

  const task = await prisma.incidentResponseTask.create({
    data: {
      organizationId: input.organizationId,
      incidentId: input.incidentId,
      phase: input.phase,
      title,
      description,
      priority: input.priority ?? "MEDIUM",
      isRequired: input.isRequired ?? true,
      assignedToUserId: input.assignedToUserId ?? null,
      dueAt: input.dueAt ?? null,
      createdByUserId: input.actorId,
      status: "TODO",
    },
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: input.incidentId,
    actorUserId: input.actorId,
    activityType: "TASK_CREATED",
    message: `Response task created: ${title}`,
    metadata: { taskId: task.id, phase: input.phase },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_TASK_CREATED",
    resourceType: "IncidentResponseTask",
    resourceId: task.id,
    metadata: { incidentId: input.incidentId, title, phase: input.phase },
  });

  return { id: task.id };
}

export async function assignResponseTask(input: {
  organizationId: string;
  actorId: string;
  taskId: string;
  assignedToUserId: string | null;
}): Promise<void> {
  const task = await prisma.incidentResponseTask.findFirst({
    where: { id: input.taskId, organizationId: input.organizationId },
  });
  if (!task) throw new Error("Task not found");

  if (input.assignedToUserId) {
    await assertAssigneeInOrg(input.organizationId, input.assignedToUserId);
  }

  await prisma.incidentResponseTask.update({
    where: { id: task.id },
    data: { assignedToUserId: input.assignedToUserId },
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: task.incidentId,
    actorUserId: input.actorId,
    activityType: "TASK_ASSIGNED",
    message: input.assignedToUserId
      ? "Response task assignment updated"
      : "Response task unassigned",
    metadata: {
      taskId: task.id,
      from: task.assignedToUserId,
      to: input.assignedToUserId,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_TASK_ASSIGNED",
    resourceType: "IncidentResponseTask",
    resourceId: task.id,
    metadata: {
      incidentId: task.incidentId,
      from: task.assignedToUserId,
      to: input.assignedToUserId,
    },
  });
}

export async function updateResponseTaskStatus(input: {
  organizationId: string;
  actorId: string;
  taskId: string;
  status: ResponseTaskStatus;
  blockedReason?: string | null;
  skipReason?: string | null;
  completionNote?: string | null;
}): Promise<void> {
  const task = await prisma.incidentResponseTask.findFirst({
    where: { id: input.taskId, organizationId: input.organizationId },
  });
  if (!task) throw new Error("Task not found");

  if (input.status === "BLOCKED") {
    const reason = sanitizeIncidentText(input.blockedReason, 2000);
    if (!reason) {
      throw new Error("Blocked tasks require a reason");
    }
  }
  if (input.status === "SKIPPED") {
    if (task.isRequired && !sanitizeIncidentText(input.skipReason, 2000)) {
      throw new Error("Required tasks cannot be skipped without a reason");
    }
    if (!task.isRequired && !sanitizeIncidentText(input.skipReason, 2000)) {
      throw new Error("Skipped tasks require a reason");
    }
  }

  const now = new Date();
  const data: {
    status: ResponseTaskStatus;
    blockedReason?: string | null;
    skipReason?: string | null;
    completionNote?: string | null;
    completedAt?: Date | null;
    completedByUserId?: string | null;
  } = {
    status: input.status,
  };

  if (input.status === "BLOCKED") {
    data.blockedReason = sanitizeIncidentText(input.blockedReason, 2000);
  }
  if (input.status === "SKIPPED") {
    data.skipReason = sanitizeIncidentText(input.skipReason, 2000);
    data.completedAt = now;
    data.completedByUserId = input.actorId;
  }
  if (input.status === "COMPLETED") {
    data.completionNote = sanitizeIncidentText(input.completionNote, 2000);
    data.completedAt = now;
    data.completedByUserId = input.actorId;
    data.blockedReason = null;
    data.skipReason = null;
  }
  if (input.status === "TODO" || input.status === "IN_PROGRESS") {
    data.completedAt = null;
    data.completedByUserId = null;
    if (input.status === "TODO") {
      data.blockedReason = null;
      data.skipReason = null;
    }
  }

  await prisma.incidentResponseTask.update({
    where: { id: task.id },
    data,
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: task.incidentId,
    actorUserId: input.actorId,
    activityType: "TASK_STATUS_CHANGED",
    message: `Task "${task.title}" → ${input.status}`,
    metadata: {
      taskId: task.id,
      from: task.status,
      to: input.status,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_TASK_STATUS_CHANGED",
    resourceType: "IncidentResponseTask",
    resourceId: task.id,
    metadata: {
      incidentId: task.incidentId,
      from: task.status,
      to: input.status,
    },
  });
}

/** Alias matching case-management API naming */
export const setResponseTaskStatus = updateResponseTaskStatus;

export async function updateResponseTaskDetails(input: {
  organizationId: string;
  actorId: string;
  taskId: string;
  priority?: ResponseTaskPriority;
  dueAt?: Date | null;
  title?: string;
  description?: string | null;
}): Promise<void> {
  const task = await prisma.incidentResponseTask.findFirst({
    where: { id: input.taskId, organizationId: input.organizationId },
  });
  if (!task) throw new Error("Task not found");

  await prisma.incidentResponseTask.update({
    where: { id: task.id },
    data: {
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
      ...(input.title
        ? { title: sanitizeIncidentText(input.title, 300) ?? input.title }
        : {}),
      ...(input.description !== undefined
        ? { description: sanitizeIncidentText(input.description, 5000) }
        : {}),
    },
  });
  // Intentionally no audit for trivial field tweaks (priority/due) unless status changes.
}

export async function countOverdueResponseTasks(
  organizationId: string
): Promise<number> {
  const now = new Date();
  return prisma.incidentResponseTask.count({
    where: {
      organizationId,
      dueAt: { lt: now },
      status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
    },
  });
}
