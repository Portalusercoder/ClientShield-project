/**
 * Database-backed cross-process lock for Wazuh ingestion.
 * Manual Sync and the background worker share this lease.
 */
import { prisma } from "@/lib/db";

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

export class WazuhIngestionLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WazuhIngestionLockError";
  }
}

/**
 * Acquire a lease for organization ingestion.
 * Recovers expired leases from crashed workers.
 */
export async function acquireWazuhIngestionDbLock(input: {
  organizationId: string;
  lockedBy: string;
  leaseMs?: number;
}): Promise<void> {
  const leaseMs = input.leaseMs ?? DEFAULT_LEASE_MS;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + leaseMs);

  // Ensure row exists
  await prisma.wazuhIngestionState.upsert({
    where: { organizationId: input.organizationId },
    create: { organizationId: input.organizationId },
    update: {},
  });

  const updated = await prisma.$executeRaw`
    UPDATE "WazuhIngestionState"
    SET
      "lockedBy" = ${input.lockedBy},
      "lockedAt" = ${now},
      "lockExpiresAt" = ${expiresAt},
      "updatedAt" = ${now}
    WHERE "organizationId" = ${input.organizationId}
      AND (
        "lockExpiresAt" IS NULL
        OR "lockExpiresAt" < ${now}
        OR "lockedBy" = ${input.lockedBy}
      )
  `;

  if (Number(updated) === 0) {
    throw new WazuhIngestionLockError(
      "A Wazuh sync is already in progress for this organization"
    );
  }
}

export async function releaseWazuhIngestionDbLock(input: {
  organizationId: string;
  lockedBy: string;
}): Promise<void> {
  const now = new Date();
  await prisma.$executeRaw`
    UPDATE "WazuhIngestionState"
    SET
      "lockedBy" = NULL,
      "lockedAt" = NULL,
      "lockExpiresAt" = NULL,
      "updatedAt" = ${now}
    WHERE "organizationId" = ${input.organizationId}
      AND "lockedBy" = ${input.lockedBy}
  `;
}

export async function renewWazuhIngestionDbLock(input: {
  organizationId: string;
  lockedBy: string;
  leaseMs?: number;
}): Promise<void> {
  const leaseMs = input.leaseMs ?? DEFAULT_LEASE_MS;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + leaseMs);
  await prisma.$executeRaw`
    UPDATE "WazuhIngestionState"
    SET
      "lockExpiresAt" = ${expiresAt},
      "updatedAt" = ${now}
    WHERE "organizationId" = ${input.organizationId}
      AND "lockedBy" = ${input.lockedBy}
  `;
}

export async function touchWazuhWorkerHeartbeat(input: {
  organizationId: string;
  workerId: string;
}): Promise<void> {
  const now = new Date();
  await prisma.wazuhIngestionState.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      workerId: input.workerId,
      workerLastHeartbeatAt: now,
    },
    update: {
      workerId: input.workerId,
      workerLastHeartbeatAt: now,
    },
  });
}
