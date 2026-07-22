import type { IncidentActivityType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sanitizeIncidentText } from "@/lib/incidents/sanitize";

export async function appendIncidentActivity(input: {
  organizationId: string;
  incidentId: string;
  actorUserId?: string | null;
  activityType: IncidentActivityType;
  message: string;
  metadata?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  const db = input.tx ?? prisma;
  await db.incidentActivity.create({
    data: {
      organizationId: input.organizationId,
      incidentId: input.incidentId,
      actorUserId: input.actorUserId ?? null,
      activityType: input.activityType,
      message: sanitizeIncidentText(input.message, 2000) ?? input.message,
      metadata: input.metadata,
    },
  });
}
