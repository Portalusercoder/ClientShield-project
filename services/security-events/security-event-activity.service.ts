import type { Prisma, SecurityEventActivityType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sanitizeFreeText } from "@/services/wazuh/wazuh-sanitizer.service";

export async function recordSecurityEventActivity(input: {
  organizationId: string;
  securityEventId: string;
  actorUserId?: string | null;
  activityType: SecurityEventActivityType;
  message: string;
  note?: string | null;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.securityEventActivity.create({
    data: {
      organizationId: input.organizationId,
      securityEventId: input.securityEventId,
      actorUserId: input.actorUserId ?? null,
      activityType: input.activityType,
      message: sanitizeFreeText(input.message, 1000) ?? input.activityType,
      note: input.note ? sanitizeFreeText(input.note, 2000) : null,
      metadata: input.metadata,
    },
  });
}

/**
 * Aggregated correlation activity — at most one live CORRELATED_OCCURRENCE row
 * per event (updated in place) so high-volume SCA noise does not flood the timeline.
 */
export async function recordOrUpdateCorrelatedOccurrence(input: {
  organizationId: string;
  securityEventId: string;
  occurrenceCount: number;
  correlationSummary: string | null;
}): Promise<void> {
  const existing = await prisma.securityEventActivity.findFirst({
    where: {
      organizationId: input.organizationId,
      securityEventId: input.securityEventId,
      activityType: "CORRELATED_OCCURRENCE",
    },
    orderBy: { createdAt: "desc" },
  });

  const message =
    sanitizeFreeText(
      `Occurrence count is now ${input.occurrenceCount}. ${input.correlationSummary ?? ""}`.trim(),
      1000
    ) ?? `Occurrence count is now ${input.occurrenceCount}`;

  const metadata = {
    occurrenceCount: input.occurrenceCount,
  } satisfies Prisma.InputJsonValue;

  if (existing) {
    await prisma.securityEventActivity.update({
      where: { id: existing.id },
      data: { message, metadata },
    });
    return;
  }

  await prisma.securityEventActivity.create({
    data: {
      organizationId: input.organizationId,
      securityEventId: input.securityEventId,
      actorUserId: null,
      activityType: "CORRELATED_OCCURRENCE",
      message,
      metadata,
    },
  });
}

export async function listSecurityEventActivities(
  organizationId: string,
  securityEventId: string
) {
  return prisma.securityEventActivity.findMany({
    where: { organizationId, securityEventId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
  });
}
