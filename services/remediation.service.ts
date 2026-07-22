import type {
  FindingSeverity,
  Prisma,
  RemediationPriority,
  RemediationStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/services/audit.service";
import type {
  CreateRemediationTaskInput,
  UpdateRemediationTaskInput,
} from "@/lib/validations/findings";
import type {
  RemediationFilters,
  RemediationListItem,
  RemediationListResult,
} from "@/types/findings";

function isOverdue(
  dueDate: Date | null,
  status: RemediationStatus
): boolean {
  if (!dueDate) return false;
  if (status === "COMPLETED" || status === "CANCELLED") return false;
  return dueDate.getTime() < Date.now();
}

function mapTask(task: {
  id: string;
  title: string;
  status: RemediationStatus;
  priority: RemediationPriority;
  dueDate: Date | null;
  findingId: string | null;
  assetId: string;
  assignedToUserId: string | null;
  createdAt: Date;
  completedAt: Date | null;
  finding: {
    title: string;
    severity: FindingSeverity;
    client: { name: string } | null;
  } | null;
  asset: { name: string };
  assignedTo: { name: string | null } | null;
}): RemediationListItem {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    isOverdue: isOverdue(task.dueDate, task.status),
    findingId: task.findingId,
    findingTitle: task.finding?.title ?? null,
    findingSeverity: task.finding?.severity ?? null,
    clientName: task.finding?.client?.name ?? null,
    assetId: task.assetId,
    assetName: task.asset.name,
    assignedToUserId: task.assignedToUserId,
    assignedToName: task.assignedTo?.name ?? null,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
  };
}

export async function listRemediationTasks(
  organizationId: string,
  filters: RemediationFilters = {}
): Promise<RemediationListResult> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.RemediationTaskWhereInput = {
    organizationId,
    ...(filters.search
      ? {
          OR: [
            { title: { contains: filters.search, mode: "insensitive" } },
            {
              finding: {
                title: { contains: filters.search, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
    ...(filters.status && filters.status !== "ALL"
      ? { status: filters.status }
      : {}),
    ...(filters.severity && filters.severity !== "ALL"
      ? { finding: { severity: filters.severity } }
      : {}),
    ...(filters.assignedToUserId && filters.assignedToUserId !== "ALL"
      ? { assignedToUserId: filters.assignedToUserId }
      : {}),
    ...(filters.overdueOnly
      ? {
          dueDate: { lt: new Date() },
          status: { in: ["OPEN", "IN_PROGRESS", "BLOCKED"] },
        }
      : {}),
  };

  const [tasks, total, users] = await Promise.all([
    prisma.remediationTask.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      include: {
        finding: {
          select: {
            title: true,
            severity: true,
            client: { select: { name: true } },
          },
        },
        asset: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.remediationTask.count({ where }),
    prisma.user.findMany({
      where: { organizationId },
      select: { id: true, name: true, email: true },
      orderBy: { email: "asc" },
    }),
  ]);

  return {
    tasks: tasks.map(mapTask),
    total,
    page,
    pageSize,
    users,
  };
}

export async function getRemediationTaskById(
  organizationId: string,
  taskId: string
) {
  return prisma.remediationTask.findFirst({
    where: { id: taskId, organizationId },
    include: {
      finding: {
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
          client: { select: { name: true } },
        },
      },
      asset: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function createRemediationTask(input: {
  organizationId: string;
  actorId: string;
  data: CreateRemediationTaskInput;
}) {
  const finding = await prisma.finding.findFirst({
    where: { id: input.data.findingId, organizationId: input.organizationId },
  });
  if (!finding) throw new Error("Finding not found");

  if (
    finding.status === "OPEN" &&
    !input.data.confirmUnvalidated
  ) {
    throw new Error(
      "This finding has not yet been validated. Confirm to create a remediation task anyway."
    );
  }

  if (input.data.assignedToUserId) {
    const user = await prisma.user.findFirst({
      where: {
        id: input.data.assignedToUserId,
        organizationId: input.organizationId,
      },
      select: { id: true },
    });
    if (!user) throw new Error("Assigned user not found in organization");
  }

  const task = await prisma.remediationTask.create({
    data: {
      organizationId: input.organizationId,
      findingId: finding.id,
      assetId: finding.assetId,
      title: input.data.title,
      description: input.data.description || null,
      notes: input.data.notes || null,
      priority: input.data.priority,
      assignedToUserId: input.data.assignedToUserId,
      dueDate: input.data.dueDate ? new Date(input.data.dueDate) : null,
      status: "OPEN",
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "REMEDIATION_TASK_CREATED",
    resourceType: "RemediationTask",
    resourceId: task.id,
    metadata: { findingId: finding.id },
  });

  return task;
}

export async function updateRemediationTask(input: {
  organizationId: string;
  actorId: string;
  taskId: string;
  data: UpdateRemediationTaskInput;
}) {
  const existing = await prisma.remediationTask.findFirst({
    where: { id: input.taskId, organizationId: input.organizationId },
  });
  if (!existing) throw new Error("Remediation task not found");

  if (input.data.assignedToUserId) {
    const user = await prisma.user.findFirst({
      where: {
        id: input.data.assignedToUserId,
        organizationId: input.organizationId,
      },
      select: { id: true },
    });
    if (!user) throw new Error("Assigned user not found in organization");
  }

  let completedAt: Date | null | undefined;
  if (input.data.status === "COMPLETED") {
    completedAt = new Date();
  } else if (input.data.status !== undefined) {
    completedAt = null;
  }

  const task = await prisma.remediationTask.update({
    where: { id: existing.id },
    data: {
      ...(input.data.title !== undefined ? { title: input.data.title } : {}),
      ...(input.data.status !== undefined ? { status: input.data.status } : {}),
      ...(input.data.priority !== undefined
        ? { priority: input.data.priority }
        : {}),
      ...(input.data.assignedToUserId !== undefined
        ? { assignedToUserId: input.data.assignedToUserId }
        : {}),
      ...(input.data.dueDate !== undefined
        ? {
            dueDate: input.data.dueDate
              ? new Date(input.data.dueDate)
              : null,
          }
        : {}),
      ...(input.data.notes !== undefined ? { notes: input.data.notes } : {}),
      ...(completedAt !== undefined ? { completedAt } : {}),
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action:
      input.data.status === "COMPLETED"
        ? "REMEDIATION_COMPLETED"
        : "REMEDIATION_TASK_UPDATED",
    resourceType: "RemediationTask",
    resourceId: task.id,
    metadata: {
      status: task.status,
      findingId: task.findingId,
    },
  });

  return task;
}
