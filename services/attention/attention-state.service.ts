/**
 * Attention overlay mutations: shared acknowledgement, hybrid claim, personal snooze.
 *
 * Phase 6b3 ownership model:
 * - ACKNOWLEDGED = reviewed (overlay); never implies claim/assign; never removes eligibility
 * - CLAIMED = temporary work lock (overlay for SECURITY_EVENT / INVESTIGATION)
 * - ASSIGNED = formal ownership (Finding / Incident / InvestigationGroup)
 * Finding/Incident Attention Claim delegates to native Assign (no separate claim layer).
 * Investigation Claim does NOT write assignedToUserId (independent).
 */
import { Prisma, type AttentionSourceType, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hasMinimumRole } from "@/lib/auth/permissions";
import type { AuthSession } from "@/lib/auth/types";
import { createAuditLog } from "@/services/audit.service";
import { buildEligibilityGeneration } from "@/services/attention/eligibility-generation";
import {
  ATTENTION_INV_ELIGIBLE_STATUSES,
  ATTENTION_SE_ELIGIBLE,
} from "@/services/attention/queue-rules";
import { assignFinding } from "@/services/findings.service";
import { assignIncident } from "@/services/incidents.service";
import { appendInvestigationActivity } from "@/services/investigations/investigation-activity.service";
import { OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import { notifyClaimTransferred } from "@/services/notifications/notification-producers.service";
import { recordSecurityEventActivity } from "@/services/security-events/security-event-activity.service";
import { UNRESOLVED_FINDING_STATUSES } from "@/types/findings";
import type { AttentionSnoozePreset } from "@/types/attention";
import type { NotificationSourceType } from "@prisma/client";

function attentionHref(
  sourceType: AttentionSourceType,
  sourceId: string
): string {
  switch (sourceType) {
    case "SECURITY_EVENT":
      return `/security-events/${sourceId}`;
    case "INVESTIGATION":
      return `/investigations/${sourceId}`;
    case "FINDING":
      return `/vulnerabilities/${sourceId}`;
    case "INCIDENT":
      return `/incidents/${sourceId}`;
    default:
      return "/attention";
  }
}

function toNotificationSourceType(
  sourceType: AttentionSourceType
): NotificationSourceType {
  switch (sourceType) {
    case "SECURITY_EVENT":
      return "SECURITY_EVENT";
    case "INVESTIGATION":
      return "INVESTIGATION";
    case "FINDING":
      return "FINDING";
    case "INCIDENT":
      return "INCIDENT";
    default:
      return "SYSTEM";
  }
}

async function emitClaimTransferredIfNeeded(input: {
  organizationId: string;
  actorId: string;
  sourceType: AttentionSourceType;
  sourceId: string;
  title: string;
  previousHolderUserId: string | null;
  newHolderUserId: string;
  transferred: boolean;
  clientId?: string | null;
  assetId?: string | null;
}): Promise<void> {
  if (!input.transferred) return;
  const transferGeneration = await prisma.auditLog.count({
    where: {
      organizationId: input.organizationId,
      action: "ATTENTION_CLAIM_TRANSFERRED",
      OR: [
        { resourceId: input.sourceId },
        {
          metadata: {
            path: ["sourceId"],
            equals: input.sourceId,
          },
        },
      ],
    },
  });
  await notifyClaimTransferred({
    organizationId: input.organizationId,
    sourceType: toNotificationSourceType(input.sourceType),
    sourceId: input.sourceId,
    title: input.title,
    actorId: input.actorId,
    previousHolderUserId: input.previousHolderUserId,
    newHolderUserId: input.newHolderUserId,
    href: attentionHref(input.sourceType, input.sourceId),
    transferGeneration: Math.max(transferGeneration, 1),
    clientId: input.clientId,
    assetId: input.assetId,
  });
}

const SE_ELIGIBLE = ATTENTION_SE_ELIGIBLE;
const INV_ELIGIBLE = {
  severity: ["CRITICAL", "HIGH"] as const,
  status: ATTENTION_INV_ELIGIBLE_STATUSES,
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
        assignedToUserId: true,
      },
    });
    if (!row) throw new Error("Investigation not found");
    if (
      !INV_ELIGIBLE.severity.includes(row.severity as "CRITICAL" | "HIGH") ||
      !INV_ELIGIBLE.status.includes(
        row.status as (typeof INV_ELIGIBLE.status)[number]
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
      nativeAssigneeId: row.assignedToUserId,
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

async function assertClaimTargetInOrg(
  organizationId: string,
  userId: string
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId, disabledAt: null },
    select: { id: true },
  });
  if (!user) {
    throw new Error("Claim target not found in organization");
  }
}

/**
 * Read-only ownership snapshot for detail pages (SE / Investigation).
 */
export async function getAttentionOwnershipSnapshot(input: {
  organizationId: string;
  sourceType: AttentionSourceType;
  sourceId: string;
}): Promise<{
  eligible: boolean;
  eligibilityGeneration: string | null;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  acknowledgedByName: string | null;
  claimedByUserId: string | null;
  claimedByName: string | null;
  claimedAt: Date | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
}> {
  try {
    const source = await loadEligibleAttentionSource(input);
    const state = await prisma.socAttentionState.findUnique({
      where: {
        organizationId_sourceType_sourceId_eligibilityGeneration: {
          organizationId: input.organizationId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          eligibilityGeneration: source.eligibilityGeneration,
        },
      },
      include: {
        acknowledgedBy: { select: { id: true, name: true } },
        claimedBy: { select: { id: true, name: true } },
      },
    });

    let assignedToName: string | null = null;
    if (source.nativeAssigneeId) {
      const u = await prisma.user.findFirst({
        where: {
          id: source.nativeAssigneeId,
          organizationId: input.organizationId,
        },
        select: { name: true },
      });
      assignedToName = u?.name ?? null;
    }

    const claimedByUserId =
      input.sourceType === "SECURITY_EVENT" ||
      input.sourceType === "INVESTIGATION"
        ? state?.claimedByUserId ?? null
        : null;

    return {
      eligible: true,
      eligibilityGeneration: source.eligibilityGeneration,
      acknowledgedAt: state?.acknowledgedAt ?? null,
      acknowledgedByUserId: state?.acknowledgedByUserId ?? null,
      acknowledgedByName: state?.acknowledgedBy?.name ?? null,
      claimedByUserId,
      claimedByName: state?.claimedBy?.name ?? null,
      claimedAt: state?.claimedAt ?? null,
      assignedToUserId: source.nativeAssigneeId,
      assignedToName,
    };
  } catch {
    return {
      eligible: false,
      eligibilityGeneration: null,
      acknowledgedAt: null,
      acknowledgedByUserId: null,
      acknowledgedByName: null,
      claimedByUserId: null,
      claimedByName: null,
      claimedAt: null,
      assignedToUserId: null,
      assignedToName: null,
    };
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
      claimHolderId: row.claimedByUserId ?? null,
    },
  });

  if (source.sourceType === "SECURITY_EVENT") {
    await recordSecurityEventActivity({
      organizationId,
      securityEventId: source.sourceId,
      actorUserId: input.session.userId,
      activityType: "ATTENTION_ACKNOWLEDGED",
      message: "Attention item acknowledged (review flag — not triage status)",
    });
  }

  return {
    acknowledgedAt: row.acknowledgedAt!,
    acknowledgedByUserId: row.acknowledgedByUserId!,
  };
}

async function recordOverlayClaimActivity(input: {
  organizationId: string;
  actorId: string;
  sourceType: "SECURITY_EVENT" | "INVESTIGATION";
  sourceId: string;
  previousClaimHolderId: string | null;
  newClaimHolderId: string;
  transferred: boolean;
}): Promise<void> {
  if (input.sourceType === "SECURITY_EVENT") {
    await recordSecurityEventActivity({
      organizationId: input.organizationId,
      securityEventId: input.sourceId,
      actorUserId: input.actorId,
      activityType: input.transferred
        ? "ATTENTION_CLAIM_TRANSFERRED"
        : "ATTENTION_CLAIMED",
      message: input.transferred
        ? "Attention claim transferred"
        : "Attention item claimed",
      metadata: {
        previousClaimHolderId: input.previousClaimHolderId,
        claimHolderId: input.newClaimHolderId,
      },
    });
    return;
  }

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: input.sourceId,
    actorUserId: input.actorId,
    activityType: input.transferred ? "CLAIM_TRANSFERRED" : "CLAIMED",
    message: input.transferred
      ? "Attention claim transferred"
      : "Investigation claimed in Attention (work lock — not formal assignment)",
    metadata: {
      previousClaimHolderId: input.previousClaimHolderId,
      claimHolderId: input.newClaimHolderId,
    },
  });
}

async function recordOverlayClaimReleaseActivity(input: {
  organizationId: string;
  actorId: string;
  sourceType: "SECURITY_EVENT" | "INVESTIGATION";
  sourceId: string;
  previousClaimHolderId: string;
}): Promise<void> {
  if (input.sourceType === "SECURITY_EVENT") {
    await recordSecurityEventActivity({
      organizationId: input.organizationId,
      securityEventId: input.sourceId,
      actorUserId: input.actorId,
      activityType: "ATTENTION_CLAIM_RELEASED",
      message: "Attention claim released",
      metadata: { previousClaimHolderId: input.previousClaimHolderId },
    });
    return;
  }

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: input.sourceId,
    actorUserId: input.actorId,
    activityType: "CLAIM_RELEASED",
    message: "Attention claim released",
    metadata: { previousClaimHolderId: input.previousClaimHolderId },
  });
}

export async function claimAttention(input: {
  session: AuthSession;
  sourceType: AttentionSourceType;
  sourceId: string;
  /** ADMIN transfer target; default self */
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

  await assertClaimTargetInOrg(organizationId, targetUserId);

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
    const transferred = Boolean(previous && previous !== targetUserId);
    await createAuditLog({
      organizationId,
      actorId: input.session.userId,
      action: transferred
        ? "ATTENTION_CLAIM_TRANSFERRED"
        : "ATTENTION_CLAIMED",
      resourceType: "Incident",
      resourceId: source.sourceId,
      metadata: {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        eligibilityGeneration: source.eligibilityGeneration,
        previousOwnerId: previous,
        newOwnerId: targetUserId,
        claimHolderId: targetUserId,
        delegatesToAssign: true,
        ownershipMode: "NATIVE_ASSIGN",
      },
    });
    await emitClaimTransferredIfNeeded({
      organizationId,
      actorId: input.session.userId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      title: "Incident claim",
      previousHolderUserId: previous,
      newHolderUserId: targetUserId,
      transferred,
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
    const transferred = Boolean(previous && previous !== targetUserId);
    await createAuditLog({
      organizationId,
      actorId: input.session.userId,
      action: transferred
        ? "ATTENTION_CLAIM_TRANSFERRED"
        : "ATTENTION_CLAIMED",
      resourceType: "Finding",
      resourceId: source.sourceId,
      metadata: {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        eligibilityGeneration: source.eligibilityGeneration,
        previousOwnerId: previous,
        newOwnerId: targetUserId,
        claimHolderId: targetUserId,
        delegatesToAssign: true,
        ownershipMode: "NATIVE_ASSIGN",
      },
    });
    await emitClaimTransferredIfNeeded({
      organizationId,
      actorId: input.session.userId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      title: "Finding claim",
      previousHolderUserId: previous,
      newHolderUserId: targetUserId,
      transferred,
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
    const transferred = Boolean(
      before?.claimedByUserId && before.claimedByUserId !== targetUserId
    );
    await createAuditLog({
      organizationId,
      actorId: input.session.userId,
      action: transferred
        ? "ATTENTION_CLAIM_TRANSFERRED"
        : "ATTENTION_CLAIMED",
      resourceType: "SocAttentionState",
      resourceId: updated.id,
      metadata: {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        eligibilityGeneration: source.eligibilityGeneration,
        previousOwnerId: before?.claimedByUserId ?? null,
        newOwnerId: targetUserId,
        claimHolderId: targetUserId,
        claimedAt: now.toISOString(),
        ownershipMode: "CLAIM_OVERLAY",
        assignedToUserId: source.nativeAssigneeId,
      },
    });
    await recordOverlayClaimActivity({
      organizationId,
      actorId: input.session.userId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      previousClaimHolderId: before?.claimedByUserId ?? null,
      newClaimHolderId: targetUserId,
      transferred,
    });
    await emitClaimTransferredIfNeeded({
      organizationId,
      actorId: input.session.userId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      title:
        source.sourceType === "SECURITY_EVENT"
          ? "Security Event claim"
          : "Investigation claim",
      previousHolderUserId: before?.claimedByUserId ?? null,
      newHolderUserId: targetUserId,
      transferred,
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
      claimHolderId: targetUserId,
      claimedAt: now.toISOString(),
      ownershipMode: "CLAIM_OVERLAY",
      assignedToUserId: source.nativeAssigneeId,
    },
  });
  await recordOverlayClaimActivity({
    organizationId,
    actorId: input.session.userId,
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    previousClaimHolderId: null,
    newClaimHolderId: targetUserId,
    transferred: false,
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
        claimHolderId: null,
        delegatesToAssign: true,
        ownershipMode: "NATIVE_ASSIGN",
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
        claimHolderId: null,
        delegatesToAssign: true,
        ownershipMode: "NATIVE_ASSIGN",
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
      claimHolderId: null,
      ownershipMode: "CLAIM_OVERLAY",
      assignedToUserId: source.nativeAssigneeId,
    },
  });
  await recordOverlayClaimReleaseActivity({
    organizationId,
    actorId: input.session.userId,
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    previousClaimHolderId: previous,
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
