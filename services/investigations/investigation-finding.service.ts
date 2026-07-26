/**
 * Phase 6b4 — Investigation ↔ Finding continuity.
 *
 * Relationship: Finding.investigationGroupId = primary Investigation (1:N).
 * One Investigation → many Findings. Each Finding → at most one primary Investigation.
 *
 * STATUS PROPAGATION (never silent):
 * - Investigation CLOSED / DISMISSED / RESOLVED → linked Findings are NOT auto-changed.
 * - Finding RESOLVED / ACCEPTED_RISK / FALSE_POSITIVE → Investigation is NOT auto-changed.
 * - Create / link blocked when Investigation is CLOSED or DISMISSED.
 *
 * SEVERITY:
 * - Create may inherit Investigation severity once.
 * - After creation, Finding and Investigation severities are independent.
 */
import type {
  FindingSeverity,
  IncidentSeverity,
  InvestigationStatus,
  Prisma,
} from "@prisma/client";
import {
  assertCompatibleClientIds,
  assertMatchesTargetClient,
} from "@/lib/client-isolation";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/services/audit.service";
import { appendInvestigationActivity } from "@/services/investigations/investigation-activity.service";
import { notifyFindingCreated } from "@/services/notifications/notification-producers.service";

/** Investigation states that block creating or linking Findings. */
export const FINDING_LINK_BLOCKED_INV_STATUSES: InvestigationStatus[] = [
  "CLOSED",
  "DISMISSED",
];

function mapInvSeverityToFinding(s: IncidentSeverity): FindingSeverity {
  return s;
}

function trimRequired(value: string | null | undefined, label: string, max: number): string {
  const t = value?.trim() ?? "";
  if (!t) throw new Error(`${label} is required`);
  return t.slice(0, max);
}

async function getGroupOrThrow(organizationId: string, groupId: string) {
  const group = await prisma.investigationGroup.findFirst({
    where: { id: groupId, organizationId },
  });
  if (!group) throw new Error("Investigation group not found");
  return group;
}

function assertGroupAllowsFindingLink(status: InvestigationStatus): void {
  if (FINDING_LINK_BLOCKED_INV_STATUSES.includes(status)) {
    throw new Error(
      `Cannot create or link Findings when investigation is ${status}`
    );
  }
}

export function buildFindingTitleSuggestion(investigationTitle: string): string {
  return `Finding from investigation: ${investigationTitle}`.slice(0, 300);
}

export function buildFindingDescriptionSuggestion(input: {
  investigationSummary: string | null;
  groupingExplanation: string | null;
  securityEventTitles: string[];
}): string {
  const parts: string[] = [];
  if (input.investigationSummary?.trim()) {
    parts.push(input.investigationSummary.trim());
  }
  if (input.groupingExplanation?.trim()) {
    parts.push(`Context: ${input.groupingExplanation.trim()}`);
  }
  if (input.securityEventTitles.length > 0) {
    parts.push(
      `Related security events:\n${input.securityEventTitles
        .slice(0, 10)
        .map((t) => `- ${t}`)
        .join("\n")}`
    );
  }
  return parts.join("\n\n").slice(0, 10000);
}

export async function listInvestigationFindings(
  organizationId: string,
  groupId: string
) {
  return prisma.finding.findMany({
    where: { organizationId, investigationGroupId: groupId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      source: true,
      assignedToUserId: true,
      investigationLinkedAt: true,
      asset: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Search Findings eligible to link as primary Investigation Finding.
 * Same org; not already linked to this investigation; prefer same client cohort.
 */
export async function searchLinkableFindings(input: {
  organizationId: string;
  groupId: string;
  query?: string;
  take?: number;
}) {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  const q = input.query?.trim() ?? "";
  const take = Math.min(input.take ?? 25, 50);

  const rows = await prisma.finding.findMany({
    where: {
      organizationId: input.organizationId,
      AND: [
        {
          OR: [
            { investigationGroupId: null },
            { investigationGroupId: { not: group.id } },
          ],
        },
        ...(group.clientId
          ? [
              {
                OR: [
                  { clientId: group.clientId },
                  { clientId: null },
                ],
              },
            ]
          : []),
        ...(q
          ? [
              {
                OR: [
                  { title: { contains: q, mode: "insensitive" as const } },
                  { code: { contains: q, mode: "insensitive" as const } },
                  { id: q },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take,
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      source: true,
      clientId: true,
      investigationGroupId: true,
      asset: { select: { id: true, name: true } },
    },
  });

  return rows.filter((r) => {
    if (r.investigationGroupId === group.id) return false;
    try {
      if (group.clientId) {
        assertCompatibleClientIds({
          leftClientId: group.clientId,
          rightClientId: r.clientId,
          context: "investigation ↔ finding",
        });
      }
      return true;
    } catch {
      return false;
    }
  });
}

export async function createFindingFromInvestigation(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  title: string;
  description?: string | null;
  severity?: FindingSeverity;
  assetId: string;
  assignedToUserId?: string | null;
  inheritAssignee?: boolean;
}): Promise<{ findingId: string }> {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  assertGroupAllowsFindingLink(group.status);

  const title = trimRequired(input.title, "Title", 300);
  const description = input.description?.trim()
    ? input.description.trim().slice(0, 10000)
    : null;

  const asset = await prisma.asset.findFirst({
    where: { id: input.assetId, organizationId: input.organizationId },
    select: { id: true, clientId: true },
  });
  if (!asset) throw new Error("Asset not found in organization");

  if (group.clientId && asset.clientId) {
    assertMatchesTargetClient({
      sourceClientId: group.clientId,
      targetClientId: asset.clientId,
      context: "investigation → finding asset",
    });
  }

  let assignedToUserId: string | null = null;
  if (input.assignedToUserId) {
    const u = await prisma.user.findFirst({
      where: {
        id: input.assignedToUserId,
        organizationId: input.organizationId,
        disabledAt: null,
      },
      select: { id: true },
    });
    if (!u) throw new Error("Assignee not found in organization");
    assignedToUserId = u.id;
  } else if (input.inheritAssignee && group.assignedToUserId) {
    assignedToUserId = group.assignedToUserId;
  }

  const severity =
    input.severity ?? mapInvSeverityToFinding(group.severity);

  const eventLinks = await prisma.investigationGroupEvent.findMany({
    where: {
      organizationId: input.organizationId,
      groupId: group.id,
      removedAt: null,
    },
    include: {
      securityEvent: { select: { id: true, title: true } },
    },
    take: 50,
  });

  const linkedAt = new Date();
  const finding = await prisma.finding.create({
    data: {
      organizationId: input.organizationId,
      clientId: group.clientId ?? asset.clientId ?? null,
      assetId: asset.id,
      source: "MANUAL",
      code: `INV:${group.id.slice(0, 12)}`,
      title,
      description,
      severity,
      status: "OPEN",
      assignedToUserId,
      investigationGroupId: group.id,
      investigationLinkedAt: linkedAt,
      investigationLinkedByUserId: input.actorId,
      evidence: {
        originatedFromInvestigationId: group.id,
        relatedSecurityEventIds: eventLinks.map((e) => e.securityEventId),
        relatedSecurityEventTitles: eventLinks.map(
          (e) => e.securityEvent.title
        ),
      } satisfies Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "FINDING_CREATED",
    message: `Finding created from investigation: ${title}`,
    metadata: {
      findingId: finding.id,
      severity,
      inheritedSeverity: !input.severity,
      assignedToUserId,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "FINDING_CREATED",
    resourceType: "Finding",
    resourceId: finding.id,
    metadata: {
      investigationGroupId: group.id,
      source: "MANUAL",
      severity,
      previousInvestigationGroupId: null,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_FINDING_CREATED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: {
      findingId: finding.id,
      title: title.slice(0, 200),
    },
  });

  await notifyFindingCreated({
    organizationId: input.organizationId,
    findingId: finding.id,
    title,
    actorId: input.actorId,
    assigneeUserId: assignedToUserId,
    investigationId: group.id,
    clientId: group.clientId ?? asset.clientId ?? null,
    assetId: asset.id,
  });

  const { logger, metrics, updateObservabilityContext, workflowCorrelationId } =
    await import("@/lib/observability");
  updateObservabilityContext({
    organizationId: input.organizationId,
    userId: input.actorId,
    findingId: finding.id,
    investigationId: group.id,
    correlationId: workflowCorrelationId("finding", finding.id),
  });
  metrics.inc("findings_created");
  logger.info("finding.created", {
    action: "createFindingFromInvestigation",
    findingId: finding.id,
    investigationId: group.id,
    severity,
  });

  return { findingId: finding.id };
}

export async function linkFindingToInvestigation(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  findingId: string;
}): Promise<void> {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  assertGroupAllowsFindingLink(group.status);

  const finding = await prisma.finding.findFirst({
    where: { id: input.findingId, organizationId: input.organizationId },
  });
  if (!finding) throw new Error("Finding not found");

  if (finding.investigationGroupId === group.id) {
    throw new Error("Finding is already linked to this investigation");
  }

  if (group.clientId || finding.clientId) {
    assertCompatibleClientIds({
      leftClientId: group.clientId,
      rightClientId: finding.clientId,
      context: "investigation ↔ finding",
    });
  }

  const previousInvestigationGroupId = finding.investigationGroupId;
  const linkedAt = new Date();

  await prisma.finding.update({
    where: { id: finding.id },
    data: {
      investigationGroupId: group.id,
      investigationLinkedAt: linkedAt,
      investigationLinkedByUserId: input.actorId,
    },
  });

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "FINDING_LINKED",
    message: `Finding linked: ${finding.title}`,
    metadata: {
      findingId: finding.id,
      previousInvestigationGroupId,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_FINDING_LINKED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: {
      findingId: finding.id,
      previousInvestigationGroupId,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "FINDING_INVESTIGATION_LINKED",
    resourceType: "Finding",
    resourceId: finding.id,
    metadata: {
      investigationGroupId: group.id,
      previousInvestigationGroupId,
    },
  });
}

export async function unlinkFindingFromInvestigation(input: {
  organizationId: string;
  actorId: string;
  groupId: string;
  findingId: string;
}): Promise<void> {
  const group = await getGroupOrThrow(input.organizationId, input.groupId);
  const finding = await prisma.finding.findFirst({
    where: {
      id: input.findingId,
      organizationId: input.organizationId,
      investigationGroupId: group.id,
    },
  });
  if (!finding) throw new Error("Finding is not linked to this investigation");

  await prisma.finding.update({
    where: { id: finding.id },
    data: {
      investigationGroupId: null,
      investigationLinkedAt: null,
      investigationLinkedByUserId: null,
    },
  });

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    actorUserId: input.actorId,
    activityType: "FINDING_UNLINKED",
    message: `Finding unlinked: ${finding.title}`,
    metadata: {
      findingId: finding.id,
      previousInvestigationGroupId: group.id,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INVESTIGATION_FINDING_UNLINKED",
    resourceType: "InvestigationGroup",
    resourceId: group.id,
    metadata: {
      findingId: finding.id,
      previousInvestigationGroupId: group.id,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "FINDING_INVESTIGATION_UNLINKED",
    resourceType: "Finding",
    resourceId: finding.id,
    metadata: {
      previousInvestigationGroupId: group.id,
      investigationGroupId: null,
    },
  });
}

export async function getFindingPrimaryInvestigation(
  organizationId: string,
  findingId: string
) {
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, organizationId },
    select: {
      investigationGroupId: true,
      investigationLinkedAt: true,
      investigationGroup: {
        select: {
          id: true,
          title: true,
          status: true,
          severity: true,
        },
      },
    },
  });
  if (!finding?.investigationGroup) return null;
  return {
    id: finding.investigationGroup.id,
    title: finding.investigationGroup.title,
    status: finding.investigationGroup.status,
    severity: finding.investigationGroup.severity,
    linkedAt: finding.investigationLinkedAt,
  };
}
