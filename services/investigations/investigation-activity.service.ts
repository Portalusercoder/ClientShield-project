import type { InvestigationActivityType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function appendInvestigationActivity(input: {
  organizationId: string;
  groupId: string;
  actorUserId?: string | null;
  activityType: InvestigationActivityType;
  message: string;
  note?: string | null;
  metadata?: Prisma.InputJsonValue;
}): Promise<{ id: string }> {
  const row = await prisma.investigationActivity.create({
    data: {
      organizationId: input.organizationId,
      groupId: input.groupId,
      actorUserId: input.actorUserId ?? null,
      activityType: input.activityType,
      message: input.message.slice(0, 2000),
      note: input.note?.slice(0, 5000) ?? null,
      metadata: input.metadata,
    },
    select: { id: true },
  });
  return row;
}
