import type {
  ClientOnboardingStatus,
  ClientOnboardingStep,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UpdateOnboardingStepInput } from "@/lib/validations/client-onboarding";
import type { ClientOnboardingRecord } from "@/types/client-onboarding";
import { calculateClientReadiness } from "@/services/clients/client-readiness.service";

function mapOnboarding(row: {
  id: string;
  organizationId: string;
  clientId: string;
  status: ClientOnboardingStatus;
  currentStep: ClientOnboardingStep;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ClientOnboardingRecord {
  return { ...row };
}

async function assertClientInOrganization(
  organizationId: string,
  clientId: string
): Promise<boolean> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true },
  });
  return client !== null;
}

/**
 * Returns existing onboarding row or creates NOT_STARTED → IN_PROGRESS at CLIENT_PROFILE.
 */
export async function getOrCreateClientOnboarding(
  organizationId: string,
  clientId: string
): Promise<ClientOnboardingRecord | null> {
  const ok = await assertClientInOrganization(organizationId, clientId);
  if (!ok) return null;

  const existing = await prisma.clientOnboarding.findFirst({
    where: { organizationId, clientId },
  });
  if (existing) return mapOnboarding(existing);

  const now = new Date();
  const created = await prisma.clientOnboarding.create({
    data: {
      organizationId,
      clientId,
      status: "IN_PROGRESS",
      currentStep: "CLIENT_PROFILE",
      startedAt: now,
    },
  });

  return mapOnboarding(created);
}

/** Alias used by client create flow. */
export const ensureClientOnboarding = getOrCreateClientOnboarding;

export async function getClientOnboarding(
  organizationId: string,
  clientId: string
): Promise<ClientOnboardingRecord | null> {
  const row = await prisma.clientOnboarding.findFirst({
    where: { organizationId, clientId },
  });
  return row ? mapOnboarding(row) : null;
}

export async function updateClientOnboardingStep(
  organizationId: string,
  clientId: string,
  input: UpdateOnboardingStepInput
): Promise<ClientOnboardingRecord | null> {
  const onboarding = await getOrCreateClientOnboarding(
    organizationId,
    clientId
  );
  if (!onboarding) return null;

  if (onboarding.status === "COMPLETED") {
    throw new Error("Onboarding is already completed");
  }

  const nextStatus: ClientOnboardingStatus =
    input.status ??
    (onboarding.status === "NOT_STARTED" ? "IN_PROGRESS" : onboarding.status);

  const updated = await prisma.clientOnboarding.update({
    where: { id: onboarding.id },
    data: {
      currentStep: input.step,
      status: nextStatus,
      ...(onboarding.startedAt ? {} : { startedAt: new Date() }),
    },
  });

  return mapOnboarding(updated);
}

/**
 * Completes onboarding only when readiness overall is READY.
 */
export async function completeClientOnboarding(
  organizationId: string,
  clientId: string
): Promise<ClientOnboardingRecord | null> {
  const onboarding = await getOrCreateClientOnboarding(
    organizationId,
    clientId
  );
  if (!onboarding) return null;

  if (onboarding.status === "COMPLETED") {
    return onboarding;
  }

  const readiness = await calculateClientReadiness(organizationId, clientId);
  if (!readiness || readiness.overall !== "READY") {
    const blockers = readiness?.blockers?.join("; ") || "Readiness checks failed";
    throw new Error(
      `Cannot complete onboarding until readiness is READY. ${blockers}`
    );
  }

  const now = new Date();
  const updated = await prisma.clientOnboarding.update({
    where: { id: onboarding.id },
    data: {
      status: "COMPLETED",
      currentStep: "REVIEW",
      completedAt: now,
      startedAt: onboarding.startedAt ?? now,
    },
  });

  return mapOnboarding(updated);
}

/**
 * Syncs onboarding status from readiness (READY / BLOCKED / IN_PROGRESS).
 * Does not mark COMPLETED — use completeClientOnboarding for that.
 */
export async function refreshClientOnboardingStatus(
  organizationId: string,
  clientId: string
): Promise<ClientOnboardingRecord | null> {
  const onboarding = await getOrCreateClientOnboarding(
    organizationId,
    clientId
  );
  if (!onboarding) return null;
  if (onboarding.status === "COMPLETED") return onboarding;

  const readiness = await calculateClientReadiness(organizationId, clientId);
  if (!readiness) return onboarding;

  let nextStatus: ClientOnboardingStatus = "IN_PROGRESS";
  if (readiness.overall === "BLOCKED") nextStatus = "BLOCKED";
  else if (readiness.overall === "READY") nextStatus = "READY";

  if (nextStatus === onboarding.status) return onboarding;

  const updated = await prisma.clientOnboarding.update({
    where: { id: onboarding.id },
    data: { status: nextStatus },
  });

  return mapOnboarding(updated);
}
