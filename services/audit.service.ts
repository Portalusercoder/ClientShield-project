import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

interface AuditLogInput {
  organizationId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Records an audit log entry for security-sensitive actions.
 * Never store credentials or unnecessary PII in metadata.
 */
export async function createAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata ?? undefined,
    },
  });
}
