import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Allocates the next org-scoped case number: INC-YYYY-NNNNNN.
 * Uses IncidentCaseSequence upsert + increment; pass tx when creating an Incident.
 */
export async function allocateNextCaseNumber(
  organizationId: string,
  tx?: Prisma.TransactionClient,
  at: Date = new Date()
): Promise<string> {
  const db = tx ?? prisma;
  const year = at.getUTCFullYear();

  const seq = await db.incidentCaseSequence.upsert({
    where: {
      organizationId_year: { organizationId, year },
    },
    create: {
      organizationId,
      year,
      lastValue: 1,
    },
    update: {
      lastValue: { increment: 1 },
    },
  });

  return `INC-${year}-${String(seq.lastValue).padStart(6, "0")}`;
}
