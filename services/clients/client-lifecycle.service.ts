import type { Client, ClientStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CLIENT_LIFECYCLE_TRANSITIONS } from "@/types/client-onboarding";

/**
 * INACTIVE is treated as OFFBOARDED for transition purposes.
 */
export function normalizeLifecycleStatus(status: ClientStatus): ClientStatus {
  return status === "INACTIVE" ? "OFFBOARDED" : status;
}

export function assertClientLifecycleTransition(
  from: ClientStatus,
  to: ClientStatus
): void {
  if (from === to) return;

  const normalizedFrom = normalizeLifecycleStatus(from);
  const normalizedTo = normalizeLifecycleStatus(to);

  // e.g. INACTIVE → OFFBOARDED is a normalization, always allowed
  if (normalizedFrom === normalizedTo) return;

  const allowed = CLIENT_LIFECYCLE_TRANSITIONS[from] ?? [];
  const allowedViaNormalized =
    CLIENT_LIFECYCLE_TRANSITIONS[normalizedFrom] ?? [];

  const ok =
    allowed.includes(to) ||
    allowed.includes(normalizedTo) ||
    allowedViaNormalized.includes(to) ||
    allowedViaNormalized.includes(normalizedTo);

  if (!ok) {
    throw new Error(
      `Invalid client status transition: ${from} → ${to}. Allowed: ${
        (allowed.length ? allowed : allowedViaNormalized).join(", ") || "none"
      }`
    );
  }
}

function buildTimestampPatch(
  to: ClientStatus,
  now: Date
): Prisma.ClientUpdateInput {
  const normalizedTo = normalizeLifecycleStatus(to);
  const data: Prisma.ClientUpdateInput = {
    status: normalizedTo === "OFFBOARDED" ? "OFFBOARDED" : to,
  };

  if (normalizedTo === "ONBOARDING") {
    data.onboardingStartedAt = now;
  }

  if (normalizedTo === "ACTIVE") {
    data.activatedAt = now;
    data.suspendedAt = null;
    data.offboardedAt = null;
  }

  if (normalizedTo === "SUSPENDED") {
    data.suspendedAt = now;
  }

  if (normalizedTo === "OFFBOARDED") {
    data.offboardedAt = now;
  }

  return data;
}

/**
 * Server-enforced client lifecycle transition.
 * organizationId must come from the session — never from client input.
 * Never hard-deletes.
 */
export async function transitionClientStatus(
  organizationId: string,
  clientId: string,
  toStatus: ClientStatus
): Promise<Client | null> {
  const existing = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
  });

  if (!existing) return null;

  assertClientLifecycleTransition(existing.status, toStatus);

  const normalizedFrom = normalizeLifecycleStatus(existing.status);
  const normalizedTo = normalizeLifecycleStatus(toStatus);

  if (existing.status === toStatus) {
    return existing;
  }

  // Prefer writing OFFBOARDED when normalizing from INACTIVE
  if (normalizedFrom === normalizedTo && existing.status !== "INACTIVE") {
    return existing;
  }

  const now = new Date();
  return prisma.client.update({
    where: { id: clientId },
    data: buildTimestampPatch(toStatus, now),
  });
}

export function getAllowedClientTransitions(
  from: ClientStatus
): ClientStatus[] {
  return CLIENT_LIFECYCLE_TRANSITIONS[from] ?? [];
}
