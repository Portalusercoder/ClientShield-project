import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ClientActivityFiltersInput } from "@/lib/validations/client-onboarding";
import type {
  ClientActivityItem,
  ClientActivityResult,
} from "@/types/client-onboarding";

const CLIENT_ACTIVITY_RESOURCE_TYPES = [
  "Client",
  "Asset",
  "ClientContact",
  "ClientService",
  "ClientOnboarding",
] as const;

/**
 * Timeline of AuditLog entries related to a client.
 * Matches resourceId = clientId or metadata.clientId, scoped to client-related resource types.
 */
export async function listClientActivity(
  organizationId: string,
  clientId: string,
  filters: ClientActivityFiltersInput = { page: 1, pageSize: 20 }
): Promise<ClientActivityResult> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true },
  });
  if (!client) {
    return { items: [], total: 0 };
  }

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.AuditLogWhereInput = {
    organizationId,
    resourceType: { in: [...CLIENT_ACTIVITY_RESOURCE_TYPES] },
    OR: [
      { resourceId: clientId },
      {
        metadata: {
          path: ["clientId"],
          equals: clientId,
        },
      },
    ],
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const items: ClientActivityItem[] = rows.map((row) => ({
    id: row.id,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    actorId: row.actorId,
    metadata: row.metadata,
    createdAt: row.createdAt,
  }));

  return { items, total };
}
