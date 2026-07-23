/**
 * Lease/heartbeat for the SLA escalation worker.
 * Independent of Wazuh ingestion checkpoint/locks.
 */
import { prisma } from "@/lib/db";

const DEFAULT_LEASE_MS = 2 * 60 * 1000;
const WORKER_STATE_ID = "global";

export class SlaEscalationLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlaEscalationLockError";
  }
}

async function ensureRow(): Promise<void> {
  await prisma.slaEscalationWorkerState.upsert({
    where: { id: WORKER_STATE_ID },
    create: { id: WORKER_STATE_ID },
    update: {},
  });
}

export async function acquireSlaEscalationLock(input: {
  lockedBy: string;
  leaseMs?: number;
}): Promise<void> {
  await ensureRow();
  const leaseMs = input.leaseMs ?? DEFAULT_LEASE_MS;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + leaseMs);

  const updated = await prisma.$executeRaw`
    UPDATE "SlaEscalationWorkerState"
    SET
      "lockedBy" = ${input.lockedBy},
      "lockedAt" = ${now},
      "lockExpiresAt" = ${expiresAt},
      "lastRunStartedAt" = ${now},
      "updatedAt" = ${now}
    WHERE "id" = ${WORKER_STATE_ID}
      AND (
        "lockExpiresAt" IS NULL
        OR "lockExpiresAt" < ${now}
        OR "lockedBy" = ${input.lockedBy}
      )
  `;

  if (Number(updated) === 0) {
    throw new SlaEscalationLockError(
      "SLA escalation evaluation already in progress"
    );
  }
}

export async function releaseSlaEscalationLock(input: {
  lockedBy: string;
}): Promise<void> {
  const now = new Date();
  await prisma.$executeRaw`
    UPDATE "SlaEscalationWorkerState"
    SET
      "lockedBy" = NULL,
      "lockedAt" = NULL,
      "lockExpiresAt" = NULL,
      "updatedAt" = ${now}
    WHERE "id" = ${WORKER_STATE_ID}
      AND "lockedBy" = ${input.lockedBy}
  `;
}

export async function touchSlaEscalationHeartbeat(input: {
  workerId: string;
  error?: string | null;
  success?: boolean;
}): Promise<void> {
  await ensureRow();
  const now = new Date();
  await prisma.slaEscalationWorkerState.update({
    where: { id: WORKER_STATE_ID },
    data: {
      lastHeartbeatAt: now,
      ...(input.error !== undefined
        ? { lastError: input.error?.slice(0, 500) ?? null }
        : {}),
      ...(input.success ? { lastSuccessAt: now, lastError: null } : {}),
    },
  });
}
