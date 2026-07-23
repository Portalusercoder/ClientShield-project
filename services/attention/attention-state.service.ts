/**
 * Attention overlay mutations: shared acknowledgement, hybrid claim, personal snooze.
 * Does not mutate SecurityEvent/Finding/Investigation/Incident status for ack/snooze.
 */
import { Prisma, type AttentionSourceType, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hasMinimumRole } from "@/lib/auth/permissions";
import type { AuthSession } from "@/lib/auth/types";
import { createAuditLog } from "@/services/audit.service";
import { buildEligibilityGeneration } from "@/services/attention/eligibility-generation";
import { assignFinding } from "@/services/findings.service";
import { assignIncident } from "@/services/incidents.service";
import { OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import { UNRESOLVED_FINDING_STATUSES } from "@/types/findings";
import type { AttentionSnoozePreset } from "@/types/attention";

const SE_ELIGIBLE = {
  classification: "ACTIONABLE" as const,
  severity: ["CRITICAL", "HIGH"] as const,
  status: ["NEW", "REVIEWING"] as const,
};

const INV_ELIGIBLE = {
  severity: ["CRITICAL", "HIGH"] as const,
  status: ["OPEN", "INVESTIGATING", "CONFIRMED"] as const,
};

export class AttentionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttentionConflictError";
  }
}

function assertAnalyst(session: AuthSession): void {
  if (!hasMinimumRole(session, "ANALYST")) {
    throw new Error("Forbidden");
  }
}

function assertAdmin(session: AuthSession): void {
  if (!hasMinimumRole(session, "ADMIN")) {
    throw new Error("Forbidden");
  }
}

function isAdminOrOwner(role: UserRole): boolean {
  return role === "ADMIN" || role === "OWNER";
}

export type EligibleSourceSnapshot = {
  sourceType: AttentionSourceType;
  sourceId: string;
  organizationId: string;
  eligibilityGeneration: string;
  severity: "CRITICAL" | "HIGH";
  /** Native assignee for Finding/Incident */
  nativeAssigneeId: string | null;
  findingDueDate?: Date | null;
};

/**
 * Load source, verify org + current attention eligibility, return generation snapshot.
 */
export async function loadEligibleAttentionSource(input: {
  organizationId: string;
  sourceType: AttentionSourceType;
  sourceId: string;
}): Promise<EligibleSourceSnapshot> {
  const { organizationId, sourceType, sourceId } = input;

  if (sourceType === "SECURITY_EVENT") {
    const row = await prisma.securityEvent.findFirst({
      where: { id: sourceId, organizationId },
      select: {
        id: true,
        organizationId: true,
        classification: true,
        severity: true,
        status: true,
        firstSeenAt: true,
      },
    });
    if (!row) throw new Error("Security event not found");
    if (
      row.classification !== "ACTIONABLE" ||
      !SE_ELIGIBLE.severity.includes(row.severity as "CRITICAL" | "HIGH") ||
      !SE_ELIGIBLE.status.includes(row.status as "NEW" | "REVIEWING")
    ) {
      throw new Error("Source is not eligible for the attention queue");
    }
    return {
      sourceType,
      sourceId: row.id,
      organizationId: row.organizationId,
      eligibilityGeneration: buildEligibilityGeneration({
        sourceType,
        sourceId: row.id,
        anchorAt: row.firstSeenAt,
      }),
      severity: row.severity as "CRITICAL" | "HIGH",
      nativeAssigneeId: null,
    };
  }

  if (sourceType === "FINDING") {
    const row = await prisma.finding.findFirst({
      where: { id: sourceId, organizationId },
      select: {
        id: true,
        organizationId: true,
        severity: true,
        status: true,
        firstDetectedAt: true,
        assignedToUserId: true,
        dueDate: true,
      },
    });
    if (!row) throw new Error("Finding not found");
    if (
      !["CRITICAL", "HIGH"].includes(row.severity) ||
      !UNRESOLVED_FINDING_STATUSES.includes(row.status)
    ) {
      throw new Error("Source is not eligible for the attention queue");
    }
    return {
      sourceType,
      sourceId: row.id,
      organizationId: row.organizationId,
      eligibilityGeneration: buildEligibilityGeneration({
        sourceType,
        sourceId: row.id,
        anchorAt: row.firstDetectedAt,
      }),
      severity: row.severity as "CRITICAL" | "HIGH",
      nativeAssigneeId: row.assignedToUserId,
      findingDueDate: row.dueDate,
    };
  }

  if (sourceType === "INVESTIGATION") {
    const row = await prisma.investigationGroup.findFirst({
      where: { id: sourceId, organizationId },
      select: {
        id: true,
        organizationId: true,
        severity: true,
        status: true,
        createdAt: true,
      },
    });
    if (!row) throw new Error("Investigation not found");
    if (
      !INV_ELIGIBLE.severity.includes(row.severity as "CRITICAL" | "HIGH") ||
      !INV_ELIGIBLE.status.includes(
        row.status as "OPEN" | "INVESTIGATING" | "CONFIRMED"
      )
    ) {
      throw new Error("Source is not eligible for the attention queue");
    }
    return {
      sourceType,
      sourceId: row.id,
      organizationId: row.organizationId,
      eligibilityGeneration: buildEligibilityGeneration({
        sourceType,
        sourceId: row.id,
        anchorAt: row.createdAt,
      }),
      severity: row.severity as "CRITICAL" | "HIGH",
      nativeAssigneeId: null,
    };
  }

  // INCIDENT
  const row = await prisma.incident.findFirst({
    where: { id: sourceId, organizationId },
    select: {
      id: true,
      organizationId: true,
      severity: true,
      status: true,
      detectedAt: true,
      assignedToUserId: true,
    },
  });
  if (!row) throw new Error("Incident not found");
  if (
    !["CRITICAL", "HIGH"].includes(row.severity) ||
    !OPEN_INCIDENT_STATUSES.includes(row.status)
  ) {
    throw new Error("Source is not eligible for the attention queue");
  }
  return {
    sourceType,
    sourceId: row.id,
    organizationId: row.organizationId,
    eligibilityGeneration: buildEligibilityGeneration({
      sourceType,
      sourceId: row.id,
      anchorAt: row.detectedAt,
    }),
    severity: row.severity as "CRITICAL" | "HIGH",
    nativeAssigneeId: row.assignedToUserId,
  };
}

async function upsertAttentionState(input: {
  organizationId: string;
  sourceType: AttentionSourceType;
  sourceId: string;
  eligibilityGeneration: string;
}) {
  try {
    return await prisma.socAttentionState.upsert({
      where: {
        organizationId_sourceType_sourceId_eligibilityGeneration: {
          organizationId: input.organizationId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          eligibilityGeneration: input.eligibilityGeneration,
        },
      },
      create: {
        organizationId: input.organizationId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        eligibilityGeneration: input.eligibilityGeneration,
      },
      update: {},
    });
  } catch (e) {
    // Concurrent create race — row already exists
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const existing = await prisma.socAttentionState.findUnique({
        where: {
          organizationId_sourceType_sourceId_eligibilityGeneration: {
            organizationId: input.organizationId,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            eligibilityGeneration: input.eligibilityGeneration,
          },
        },
      });
      if (existing) return existing;
    }
    throw e;
  }
}

export async function acknowledgeAttention(input: {
  session: AuthSession;
  sourceType: AttentionSourceType;
  sourceId: string;
}): Promise<{ acknowledgedAt: Date; acknowledgedByUserId: string }> {
  assertAnalyst(input.session);
  const organizationId = input.session.organizationId;
  const source = await loadEligibleAttentionSource({
    organizationId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });

  const existing = await prisma.socAttentionState.findUnique({
    where: {
      organizationId_sourceType_sourceId_eligibilityGeneration: {
        organizationId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        eligibilityGeneration: source.eligibilityGeneration,
      },
    },
  });

  if (existing?.acknowledgedAt && existing.acknowledgedByUserId) {
    return {
      acknowledgedAt: existing.acknowledgedAt,
      acknowledgedByUserId: existing.acknowledgedByUserId,
    };
  }

  const now = new Date();
  const row = await prisma.socAttentionState.upsert({
    where: {
      organizationId_sourceType_sourceId_eligibilityGeneration: {
        organizationId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        eligibilityGeneration: source.eligibilityGeneration,
      },
    },
    create: {
      organizationId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      eligibilityGeneration: source.eligibilityGeneration,
      acknowledgedAt: now,
      acknowledgedByUserId: input.session.userId,
    },
    update: {
      acknowledgedAt: now,
      acknowledgedByUserId: input.session.userId,
    },
  });

  await createAuditLog({
    organizationId,
    actorId: input.session.userId,
    action: "ATTENTION_ACKNOWLEDGED",
    resourceType: "SocAttentionState",
    resourceId: row.id,
    metadata: {
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      eligibilityGeneration: source.eligibilityGeneration,
    },
  });

  return {
    acknowledgedAt: row.acknowledgedAt!,
    acknowledgedByUserId: row.acknowledgedByUserId!,
  };
}

export async function claimAttention(input: {
  session: AuthSession;
  sourceType: AttentionSourceType;
  sourceId: string;
  /** ADMIN reassign target; default self */
  assignToUserId?: string;
}): Promise<void> {
  assertAnalyst(input.session);
  const organizationId = input.session.organizationId;
  const targetUserId = input.assignToUserId ?? input.session.userId;

  if (
    input.assignToUserId &&
    input.assignToUserId !== input.session.userId &&
    !isAdminOrOwner(input.session.role)
  ) {
    throw new Error("Forbidden");
  }

  const source = await loadEligibleAttentionSource({
    organizationId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });

  if (source.sourceType === "INCIDENT") {
    const previous = source.nativeAssigneeId;
    if (
      previous &&
      previous !== targetUserId &&
      !isAdminOrOwner(input.session.role)
    ) {
      throw new AttentionConflictError("Incident is already assigned");
    }
    await assignIncident({
      organizationId,
      actorId: input.session.userId,
      incidentId: source.sourceId,
      data: { assignedToUserId: targetUserId },
    });
    await createAuditLog({
      organizationId,
      actorId: input.session.userId,
      action:
        previous && previous !== targetUserId
          ? "ATTENTION_REASSIGNED"
          : "ATTENTION_CLAIMED",
      resourceType: "Incident",
      resourceId: source.sourceId,
      metadata: {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        eligibilityGeneration: source.eligibilityGeneration,
        previousOwnerId: previous,
        newOwnerId: targetUserId,
      },
    });
    return;
  }

  if (source.sourceType === "FINDING") {
    const previous = source.nativeAssigneeId;
    if (
      previous &&
      previous !== targetUserId &&
      !isAdminOrOwner(input.session.role)
    ) {
      throw new AttentionConflictError("Finding is already assigned");
    }
    await assignFinding({
      organizationId,
      actorId: input.session.userId,
      findingId: source.sourceId,
      data: {
        assignedToUserId: targetUserId,
        dueDate: source.findingDueDate
          ? source.findingDueDate.toISOString()
          : null,
      },
    });
    await createAuditLog({
      organizationId,
      actorId: input.session.userId,
      action:
        previous && previous !== targetUserId
          ? "ATTENTION_REASSIGNED"
          : "ATTENTION_CLAIMED",
      resourceType: "Finding",
      resourceId: source.sourceId,
      metadata: {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        eligibilityGeneration: source.eligibilityGeneration,
        previousOwnerId: previous,
        newOwnerId: targetUserId,
      },
    });
    return;
  }

  // Overlay claim: SECURITY_EVENT | INVESTIGATION
  const now = new Date();
  // ADMIN/OWNER may claim or reassign even when already claimed
  if (isAdminOrOwner(input.session.role)) {
    await upsertAttentionState({
      organizationId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      eligibilityGeneration: source.eligibilityGeneration,
    });
    const before = await prisma.socAttentionState.findUnique({
      where: {
        organizationId_sourceType_sourceId_eligibilityGeneration: {
          organizationId,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          eligibilityGeneration: source.eligibilityGeneration,
        },
      },
    });
    const updated = await prisma.socAttentionState.update({
      where: {
        organizationId_sourceType_sourceId_eligibilityGeneration: {
          organizationId,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          eligibilityGeneration: source.eligibilityGeneration,
        },
      },
      data: {
        claimedByUserId: targetUserId,
        claimedAt: now,
      },
    });
    await createAuditLog({
      organizationId,
      actorId: input.session.userId,
      action:
        before?.claimedByUserId && before.claimedByUserId !== targetUserId
          ? "ATTENTION_REASSIGNED"
          : "ATTENTION_CLAIMED",
      resourceType: "SocAttentionState",
      resourceId: updated.id,
      metadata: {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        eligibilityGeneration: source.eligibilityGeneration,
        previousOwnerId: before?.claimedByUserId ?? null,
        newOwnerId: targetUserId,
      },
    });
    return;
  }

  // Concurrent-safe claim: create-with-claim wins, else conditional updateMany
  let rowId: string | null = null;
  let wonViaCreate = false;
  try {
    const created = await prisma.socAttentionState.create({
      data: {
        organizationId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        eligibilityGeneration: source.eligibilityGeneration,
        claimedByUserId: targetUserId,
        claimedAt: now,
      },
    });
    rowId = created.id;
    wonViaCreate = true;
  } catch (e) {
    if (
      !(e instanceof Prisma.PrismaClientKnownRequestError) ||
      e.code !== "P2002"
    ) {
      throw e;
    }
  }

  if (!wonViaCreate) {
    const claimed = await prisma.socAttentionState.updateMany({
      where: {
        organizationId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        eligibilityGeneration: source.eligibilityGeneration,
        claimedByUserId: null,
      },
      data: {
        claimedByUserId: targetUserId,
        claimedAt: now,
      },
    });

    if (claimed.count === 0) {
      const current = await prisma.socAttentionState.findUnique({
        where: {
          organizationId_sourceType_sourceId_eligibilityGeneration: {
            organizationId,
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            eligibilityGeneration: source.eligibilityGeneration,
          },
        },
      });
      if (current?.claimedByUserId === targetUserId) {
        return; // idempotent self-claim
      }
      throw new AttentionConflictError("Attention item is already claimed");
    }

    const row = await prisma.socAttentionState.findUnique({
      where: {
        organizationId_sourceType_sourceId_eligibilityGeneration: {
          organizationId,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          eligibilityGeneration: source.eligibilityGeneration,
        },
      },
    });
    rowId = row?.id ?? null;
  }

  await createAuditLog({
    organizationId,
    actorId: input.session.userId,
    action: "ATTENTION_CLAIMED",
    resourceType: "SocAttentionState",
    resourceId: rowId ?? source.sourceId,
    metadata: {
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      eligibilityGeneration: source.eligibilityGeneration,
      previousOwnerId: null,
      newOwnerId: targetUserId,
    },
  });
}

export async function releaseAttentionClaim(input: {
  session: AuthSession;
  sourceType: AttentionSourceType;
  sourceId: string;
}): Promise<void> {
  assertAnalyst(input.session);
  const organizationId = input.session.organizationId;
  const source = await loadEligibleAttentionSource({
    organizationId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });

  if (source.sourceType === "INCIDENT") {
    if (
      source.nativeAssigneeId !== input.session.userId &&
      !isAdminOrOwner(input.session.role)
    ) {
      throw new Error("Forbidden");
    }
    const previous = source.nativeAssigneeId;
    await assignIncident({
      organizationId,
      actorId: input.session.userId,
      incidentId: source.sourceId,
      data: { assignedToUserId: null },
    });
    await createAuditLog({
      organizationId,
      actorId: input.session.userId,
      action: "ATTENTION_CLAIM_RELEASED",
      resourceType: "Incident",
      resourceId: source.sourceId,
      metadata: {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        eligibilityGeneration: source.eligibilityGeneration,
        previousOwnerId: previous,
        newOwnerId: null,
      },
    });
    return;
  }

  if (source.sourceType === "FINDING") {
    if (
      source.nativeAssigneeId !== input.session.userId &&
      !isAdminOrOwner(input.session.role)
    ) {
      throw new Error("Forbidden");
    }
    const previous = source.nativeAssigneeId;
    await assignFinding({
      organizationId,
      actorId: input.session.userId,
      findingId: source.sourceId,
      data: {
        assignedToUserId: null,
        dueDate: source.findingDueDate
          ? source.findingDueDate.toISOString()
          : null,
      },
    });
    await createAuditLog({
      organizationId,
      actorId: input.session.userId,
      action: "ATTENTION_CLAIM_RELEASED",
      resourceType: "Finding",
      resourceId: source.sourceId,
      metadata: {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        eligibilityGeneration: source.eligibilityGeneration,
        previousOwnerId: previous,
        newOwnerId: null,
      },
    });
    return;
  }

  const state = await prisma.socAttentionState.findUnique({
    where: {
      organizationId_sourceType_sourceId_eligibilityGeneration: {
        organizationId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        eligibilityGeneration: source.eligibilityGeneration,
      },
    },
  });
  if (!state?.claimedByUserId) return;

  if (
    state.claimedByUserId !== input.session.userId &&
    !isAdminOrOwner(input.session.role)
  ) {
    throw new Error("Forbidden");
  }

  const previous = state.claimedByUserId;
  await prisma.socAttentionState.update({
    where: { id: state.id },
    data: { claimedByUserId: null, claimedAt: null },
  });

  await createAuditLog({
    organizationId,
    actorId: input.session.userId,
    action: "ATTENTION_CLAIM_RELEASED",
    resourceType: "SocAttentionState",
    resourceId: state.id,
    metadata: {
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      eligibilityGeneration: source.eligibilityGeneration,
      previousOwnerId: previous,
      newOwnerId: null,
    },
  });
}

export function resolveSnoozeUntil(
  preset: AttentionSnoozePreset,
  customUntil?: Date | null,
  now = new Date()
): Date {
  const max = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  let until: Date;
  switch (preset) {
    case "MINUTES_15":
      until = new Date(now.getTime() + 15 * 60_000);
      break;
    case "HOUR_1":
      until = new Date(now.getTime() + 60 * 60_000);
      break;
    case "HOURS_4":
      until = new Date(now.getTime() + 4 * 60 * 60_000);
      break;
    case "UNTIL_TOMORROW": {
      until = new Date(now);
      until.setUTCDate(until.getUTCDate() + 1);
      until.setUTCHours(9, 0, 0, 0);
      if (until <= now) {
        until.setUTCDate(until.getUTCDate() + 1);
      }
      break;
    }
    case "CUSTOM":
      if (!customUntil) throw new Error("Custom snooze requires a timestamp");
      until = customUntil;
      break;
    default: {
      const _e: never = preset;
      return _e;
    }
  }
  if (until.getTime() <= now.getTime()) {
    throw new Error("Snooze must be in the future");
  }
  if (until.getTime() > max.getTime()) {
    throw new Error("Snooze cannot exceed 7 days");
  }
  return until;
}

export async function snoozeAttention(input: {
  session: AuthSession;
  sourceType: AttentionSourceType;
  sourceId: string;
  preset: AttentionSnoozePreset;
  customUntil?: Date | null;
}): Promise<{ snoozedUntil: Date }> {
  assertAnalyst(input.session);
  const organizationId = input.session.organizationId;
  const source = await loadEligibleAttentionSource({
    organizationId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });
  const snoozedUntil = resolveSnoozeUntil(input.preset, input.customUntil);

  const row = await prisma.socAttentionUserSnooze.upsert({
    where: {
      organizationId_userId_sourceType_sourceId_eligibilityGeneration: {
        organizationId,
        userId: input.session.userId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        eligibilityGeneration: source.eligibilityGeneration,
      },
    },
    create: {
      organizationId,
      userId: input.session.userId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      eligibilityGeneration: source.eligibilityGeneration,
      snoozedAt: new Date(),
      snoozedUntil,
    },
    update: {
      snoozedAt: new Date(),
      snoozedUntil,
    },
  });

  await createAuditLog({
    organizationId,
    actorId: input.session.userId,
    action: "ATTENTION_SNOOZED",
    resourceType: "SocAttentionUserSnooze",
    resourceId: row.id,
    metadata: {
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      eligibilityGeneration: source.eligibilityGeneration,
      snoozedUntil: snoozedUntil.toISOString(),
      severity: source.severity,
    },
  });

  return { snoozedUntil };
}

export async function clearAttentionSnooze(input: {
  session: AuthSession;
  sourceType: AttentionSourceType;
  sourceId: string;
}): Promise<void> {
  assertAnalyst(input.session);
  const organizationId = input.session.organizationId;
  const source = await loadEligibleAttentionSource({
    organizationId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });

  const existing = await prisma.socAttentionUserSnooze.findUnique({
    where: {
      organizationId_userId_sourceType_sourceId_eligibilityGeneration: {
        organizationId,
        userId: input.session.userId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        eligibilityGeneration: source.eligibilityGeneration,
      },
    },
  });
  if (!existing) return;

  await prisma.socAttentionUserSnooze.delete({ where: { id: existing.id } });

  await createAuditLog({
    organizationId,
    actorId: input.session.userId,
    action: "ATTENTION_SNOOZE_CLEARED",
    resourceType: "SocAttentionUserSnooze",
    resourceId: existing.id,
    metadata: {
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      eligibilityGeneration: source.eligibilityGeneration,
    },
  });
}

/** Used by tests / admin override path */
export { assertAdmin };
