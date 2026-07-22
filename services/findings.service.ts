import type {
  FindingSeverity,
  FindingSource,
  FindingStatus,
  Prisma,
  TriagePriority,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { sanitizeEvidence } from "@/lib/findings/sanitize-evidence";
import { createAuditLog } from "@/services/audit.service";
import { assertFindingTransition } from "@/services/findings/status-transitions";
import { recalculateScoresForAsset } from "@/services/scoring/score-snapshot.service";
import { suggestTriagePriority } from "@/services/scoring/suggest-priority.service";
import type {
  AssignFindingInput,
  UpdateFindingStatusInput,
  UpdateFindingTriageInput,
} from "@/lib/validations/findings";
import {
  PASSIVE_REMEDIATION_GUIDANCE,
  UNRESOLVED_FINDING_STATUSES,
  type FindingDetail,
  type FindingFilters,
  type FindingInstanceItem,
  type FindingListItem,
  type FindingListResult,
  type FindingSummaryCards,
} from "@/types/findings";

function isOverdue(dueDate: Date | null, status: FindingStatus): boolean {
  if (!dueDate) return false;
  if (!UNRESOLVED_FINDING_STATUSES.includes(status)) return false;
  return dueDate.getTime() < Date.now();
}

function assertDueDateNotPast(dueDate: string | null | undefined): void {
  if (!dueDate) return;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const asDay =
    dueDate.length === 10 ? new Date(`${dueDate}T00:00:00`) : new Date(dueDate);
  if (Number.isNaN(asDay.getTime()) || asDay.getTime() < startOfToday.getTime()) {
    throw new Error("Due date cannot be in the past");
  }
}

function evidenceString(
  evidence: Record<string, unknown> | null,
  key: string
): string | null {
  if (!evidence) return null;
  const v = evidence[key];
  return typeof v === "string" ? v : null;
}

function mapListItem(finding: {
  id: string;
  title: string;
  severity: FindingSeverity;
  status: FindingStatus;
  source: FindingSource;
  code: string | null;
  clientId: string | null;
  assetId: string;
  assignedToUserId: string | null;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  dueDate: Date | null;
  triagePriority?: TriagePriority | null;
  evidence?: unknown;
  client: { name: string } | null;
  asset: { name: string };
  assignedTo: { name: string | null } | null;
  _count?: { instances: number };
}): FindingListItem {
  const evidence =
    finding.evidence && typeof finding.evidence === "object"
      ? (finding.evidence as Record<string, unknown>)
      : null;
  return {
    id: finding.id,
    title: finding.title,
    severity: finding.severity,
    status: finding.status,
    source: finding.source,
    code: finding.code,
    clientId: finding.clientId,
    clientName: finding.client?.name ?? null,
    assetId: finding.assetId,
    assetName: finding.asset.name,
    assignedToUserId: finding.assignedToUserId,
    assignedToName: finding.assignedTo?.name ?? null,
    firstDetectedAt: finding.firstDetectedAt,
    lastDetectedAt: finding.lastDetectedAt,
    dueDate: finding.dueDate,
    isOverdue: isOverdue(finding.dueDate, finding.status),
    instanceCount: finding._count?.instances ?? 0,
    triagePriority: finding.triagePriority ?? null,
    confidence: evidenceString(evidence, "confidence"),
  };
}

export async function getFindingSummary(
  organizationId: string
): Promise<FindingSummaryCards> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    needsTriage,
    validated,
    inRemediation,
    acceptedRisk,
    overdue,
    resolvedThisMonth,
    criticalOpen,
    highOpen,
    mediumOpen,
    lowOpen,
  ] = await Promise.all([
    prisma.finding.count({ where: { organizationId, status: "OPEN" } }),
    prisma.finding.count({ where: { organizationId, status: "VALIDATED" } }),
    prisma.finding.count({ where: { organizationId, status: "IN_PROGRESS" } }),
    prisma.finding.count({
      where: { organizationId, status: "ACCEPTED_RISK" },
    }),
    prisma.finding.count({
      where: {
        organizationId,
        status: { in: UNRESOLVED_FINDING_STATUSES },
        dueDate: { lt: new Date() },
      },
    }),
    prisma.finding.count({
      where: {
        organizationId,
        status: "RESOLVED",
        resolvedAt: { gte: startOfMonth },
      },
    }),
    prisma.finding.count({
      where: {
        organizationId,
        severity: "CRITICAL",
        status: { in: UNRESOLVED_FINDING_STATUSES },
      },
    }),
    prisma.finding.count({
      where: {
        organizationId,
        severity: "HIGH",
        status: { in: UNRESOLVED_FINDING_STATUSES },
      },
    }),
    prisma.finding.count({
      where: {
        organizationId,
        severity: "MEDIUM",
        status: { in: UNRESOLVED_FINDING_STATUSES },
      },
    }),
    prisma.finding.count({
      where: {
        organizationId,
        severity: "LOW",
        status: { in: UNRESOLVED_FINDING_STATUSES },
      },
    }),
  ]);

  return {
    needsTriage,
    validated,
    inRemediation,
    acceptedRisk,
    overdue,
    resolvedThisMonth,
    criticalOpen,
    highOpen,
    mediumOpen,
    lowOpen,
  };
}

export async function listFindings(
  organizationId: string,
  filters: FindingFilters = {}
): Promise<FindingListResult> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.FindingWhereInput = {
    organizationId,
    ...(filters.search
      ? {
          OR: [
            { title: { contains: filters.search, mode: "insensitive" } },
            { code: { contains: filters.search, mode: "insensitive" } },
            { description: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(filters.clientId && filters.clientId !== "ALL"
      ? { clientId: filters.clientId }
      : {}),
    ...(filters.assetId && filters.assetId !== "ALL"
      ? { assetId: filters.assetId }
      : {}),
    ...(filters.severity && filters.severity !== "ALL"
      ? { severity: filters.severity }
      : {}),
    ...(filters.needsTriage
      ? { status: "OPEN" }
      : filters.status && filters.status !== "ALL"
        ? { status: filters.status }
        : {}),
    ...(filters.source && filters.source !== "ALL"
      ? { source: filters.source }
      : {}),
    ...(filters.triagePriority && filters.triagePriority !== "ALL"
      ? { triagePriority: filters.triagePriority }
      : {}),
    ...(filters.assignedToUserId && filters.assignedToUserId !== "ALL"
      ? { assignedToUserId: filters.assignedToUserId }
      : {}),
  };

  const [findings, total, summary, clients, assets, users] = await Promise.all([
    prisma.finding.findMany({
      where,
      orderBy: [{ severity: "desc" }, { lastDetectedAt: "desc" }],
      skip,
      take: pageSize,
      include: {
        client: { select: { name: true } },
        asset: { select: { name: true } },
        assignedTo: { select: { name: true } },
        _count: { select: { instances: true } },
      },
    }),
    prisma.finding.count({ where }),
    getFindingSummary(organizationId),
    prisma.client.findMany({
      where: { organizationId, status: { not: "INACTIVE" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.asset.findMany({
      where: {
        organizationId,
        monitoringStatus: { not: "INACTIVE" },
        ...(filters.clientId && filters.clientId !== "ALL"
          ? { clientId: filters.clientId }
          : {}),
      },
      select: { id: true, name: true, clientId: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { organizationId },
      select: { id: true, name: true, email: true },
      orderBy: { email: "asc" },
    }),
  ]);

  return {
    findings: findings.map(mapListItem),
    total,
    page,
    pageSize,
    summary,
    clients,
    assets,
    users,
  };
}

export async function listFindingsForAsset(
  organizationId: string,
  assetId: string
): Promise<FindingListItem[]> {
  const findings = await prisma.finding.findMany({
    where: { organizationId, assetId },
    orderBy: [{ status: "asc" }, { severity: "desc" }, { lastDetectedAt: "desc" }],
    include: {
      client: { select: { name: true } },
      asset: { select: { name: true } },
      assignedTo: { select: { name: true } },
      _count: { select: { instances: true } },
    },
  });
  return findings.map(mapListItem);
}

export async function listFindingsForClient(
  organizationId: string,
  clientId: string
): Promise<FindingListItem[]> {
  const belongs = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true },
  });
  if (!belongs) return [];

  const findings = await prisma.finding.findMany({
    where: { organizationId, clientId },
    orderBy: [{ status: "asc" }, { severity: "desc" }, { lastDetectedAt: "desc" }],
    include: {
      client: { select: { name: true } },
      asset: { select: { name: true } },
      assignedTo: { select: { name: true } },
      _count: { select: { instances: true } },
    },
  });
  return findings.map(mapListItem);
}

export async function getFindingById(
  organizationId: string,
  findingId: string
): Promise<FindingDetail | null> {
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, organizationId },
    include: {
      client: { select: { name: true } },
      asset: { select: { name: true, criticality: true } },
      assignedTo: { select: { name: true } },
      acceptedRiskApprovedBy: { select: { name: true } },
      validatedBy: { select: { name: true } },
      _count: { select: { instances: true } },
    },
  });

  if (!finding) return null;

  const evidence =
    finding.evidence && typeof finding.evidence === "object"
      ? (finding.evidence as Record<string, unknown>)
      : null;

  const reviewDue =
    finding.status === "ACCEPTED_RISK" &&
    finding.acceptedRiskReviewDate != null &&
    finding.acceptedRiskReviewDate.getTime() < Date.now();

  return {
    ...mapListItem(finding),
    description: finding.description,
    remediationGuidance: finding.remediationGuidance,
    evidence: sanitizeEvidence(finding.evidence),
    cvssScore: finding.cvssScore,
    cveId: finding.cveId,
    scanId: finding.scanId,
    statusReason: finding.statusReason,
    acceptedRiskApprovedByUserId: finding.acceptedRiskApprovedByUserId,
    acceptedRiskApprovedByName: finding.acceptedRiskApprovedBy?.name ?? null,
    acceptedRiskApprovedAt: finding.acceptedRiskApprovedAt,
    acceptedRiskReviewDate: finding.acceptedRiskReviewDate,
    riskAcceptanceReviewDue: reviewDue,
    validatedAt: finding.validatedAt,
    validatedByUserId: finding.validatedByUserId,
    validatedByName: finding.validatedBy?.name ?? null,
    validationNotes: finding.validationNotes,
    analystNotes: finding.analystNotes,
    businessImpact: finding.businessImpact,
    exploitabilityAssessment: finding.exploitabilityAssessment,
    remediationComplexity: finding.remediationComplexity,
    suggestedPriority: suggestTriagePriority({
      severity: finding.severity,
      assetCriticality: finding.asset.criticality,
      status: finding.status,
    }),
    assetCriticality: finding.asset.criticality,
    resolvedAt: finding.resolvedAt,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
    organizationId: finding.organizationId,
    confidence: evidenceString(evidence, "confidence"),
    risk: evidenceString(evidence, "risk"),
    pluginId:
      evidenceString(evidence, "pluginId") ??
      (finding.code?.startsWith("ZAP:") ? finding.code.slice(4) : null),
    cweId: evidenceString(evidence, "cweId") ?? evidenceString(evidence, "cweid"),
    wascId:
      evidenceString(evidence, "wascId") ?? evidenceString(evidence, "wascid"),
  };
}

export async function listFindingInstances(
  organizationId: string,
  findingId: string,
  options: { page?: number; pageSize?: number } = {}
): Promise<{
  instances: FindingInstanceItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  const finding = await prisma.finding.findFirst({
    where: { id: findingId, organizationId },
    select: { id: true },
  });
  if (!finding) {
    return { instances: [], total: 0, page, pageSize };
  }

  const [rows, total] = await Promise.all([
    prisma.findingInstance.findMany({
      where: { organizationId, findingId },
      orderBy: [{ lastDetectedAt: "desc" }, { normalizedPath: "asc" }],
      skip,
      take: pageSize,
    }),
    prisma.findingInstance.count({
      where: { organizationId, findingId },
    }),
  ]);

  return {
    instances: rows.map((row) => ({
      id: row.id,
      url: row.url,
      normalizedPath: row.normalizedPath,
      httpMethod: row.httpMethod,
      parameter: row.parameter,
      firstDetectedAt: row.firstDetectedAt,
      lastDetectedAt: row.lastDetectedAt,
      scanId: row.scanId,
      evidence: sanitizeEvidence(row.evidence),
    })),
    total,
    page,
    pageSize,
  };
}

export async function listOrgUsers(organizationId: string) {
  return prisma.user.findMany({
    where: { organizationId },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { email: "asc" },
  });
}

async function assertUserInOrg(
  organizationId: string,
  userId: string
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: { id: true },
  });
  if (!user) {
    throw new Error("Assigned user not found in organization");
  }
}

export async function updateFindingStatus(input: {
  organizationId: string;
  actorId: string;
  findingId: string;
  data: UpdateFindingStatusInput;
  canAcceptRisk?: boolean;
}): Promise<FindingDetail> {
  const existing = await prisma.finding.findFirst({
    where: { id: input.findingId, organizationId: input.organizationId },
  });
  if (!existing) throw new Error("Finding not found");

  const nextStatus = input.data.status;
  assertFindingTransition(existing.status, nextStatus);

  if (nextStatus === "ACCEPTED_RISK" && !input.canAcceptRisk) {
    throw new Error("Only ADMIN or OWNER can accept risk");
  }

  if (
    existing.status === "ACCEPTED_RISK" &&
    (nextStatus === "OPEN" || nextStatus === "VALIDATED") &&
    !input.canAcceptRisk
  ) {
    throw new Error("Only ADMIN or OWNER can revoke risk acceptance");
  }

  if (
    (nextStatus === "FALSE_POSITIVE" || nextStatus === "ACCEPTED_RISK") &&
    !input.data.reason?.trim()
  ) {
    throw new Error("A reason is required for this status change");
  }

  if (
    nextStatus === "RESOLVED" &&
    !input.data.reason?.trim() &&
    (existing.source === "OWASP_ZAP" || existing.source === "MANUAL")
  ) {
    throw new Error(
      "Resolution note required (manual verification required for this finding source)"
    );
  }

  const now = new Date();
  const leavingAcceptedRisk =
    existing.status === "ACCEPTED_RISK" && nextStatus !== "ACCEPTED_RISK";

  const updated = await prisma.finding.update({
    where: { id: existing.id },
    data: {
      status: nextStatus,
      statusReason:
        nextStatus === "FALSE_POSITIVE" ||
        nextStatus === "ACCEPTED_RISK" ||
        nextStatus === "RESOLVED"
          ? input.data.reason ?? existing.statusReason
          : existing.statusReason,
      resolvedAt: nextStatus === "RESOLVED" ? now : null,
      ...(nextStatus === "VALIDATED"
        ? {
            validatedAt: now,
            validatedByUserId: input.actorId,
            validationNotes:
              input.data.validationNotes?.trim() || existing.validationNotes,
          }
        : {}),
      ...(nextStatus === "ACCEPTED_RISK"
        ? {
            acceptedRiskApprovedByUserId: input.actorId,
            acceptedRiskApprovedAt: now,
            acceptedRiskReviewDate: input.data.acceptedRiskReviewDate
              ? new Date(input.data.acceptedRiskReviewDate)
              : null,
          }
        : {}),
      ...(leavingAcceptedRisk
        ? {
            acceptedRiskApprovedByUserId: null,
            acceptedRiskApprovedAt: null,
            acceptedRiskReviewDate: null,
          }
        : {}),
    },
  });

  const action =
    nextStatus === "RESOLVED"
      ? existing.source === "OWASP_ZAP"
        ? "FINDING_MANUAL_RESOLVED"
        : "FINDING_RESOLVED"
      : nextStatus === "VALIDATED"
        ? "FINDING_VALIDATED"
        : nextStatus === "FALSE_POSITIVE"
          ? "FINDING_MARKED_FALSE_POSITIVE"
          : nextStatus === "ACCEPTED_RISK"
            ? "FINDING_ACCEPTED_RISK"
            : leavingAcceptedRisk
              ? "FINDING_RISK_REVOKED"
              : nextStatus === "OPEN" &&
                  (existing.status === "RESOLVED" ||
                    existing.status === "FALSE_POSITIVE" ||
                    existing.status === "ACCEPTED_RISK")
                ? "FINDING_REOPENED"
                : "FINDING_STATUS_CHANGED";

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action,
    resourceType: "Finding",
    resourceId: updated.id,
    metadata: {
      from: existing.status,
      to: nextStatus,
      hasReason: Boolean(input.data.reason),
      assetId: existing.assetId,
      clientId: existing.clientId,
    },
  });

  await recalculateScoresForAsset({
    organizationId: input.organizationId,
    assetId: existing.assetId,
    reason: `finding_status_${existing.status}_to_${nextStatus}`,
    actorId: input.actorId,
  });

  const detail = await getFindingById(input.organizationId, updated.id);
  if (!detail) throw new Error("Finding not found after update");
  return detail;
}

export async function updateFindingTriage(input: {
  organizationId: string;
  actorId: string;
  findingId: string;
  data: UpdateFindingTriageInput;
}): Promise<FindingDetail> {
  const existing = await prisma.finding.findFirst({
    where: { id: input.findingId, organizationId: input.organizationId },
  });
  if (!existing) throw new Error("Finding not found");

  const priorityChanged =
    input.data.triagePriority !== undefined &&
    input.data.triagePriority !== existing.triagePriority;

  await prisma.finding.update({
    where: { id: existing.id },
    data: {
      ...(input.data.triagePriority !== undefined
        ? { triagePriority: input.data.triagePriority }
        : {}),
      ...(input.data.businessImpact !== undefined
        ? { businessImpact: input.data.businessImpact }
        : {}),
      ...(input.data.exploitabilityAssessment !== undefined
        ? { exploitabilityAssessment: input.data.exploitabilityAssessment }
        : {}),
      ...(input.data.remediationComplexity !== undefined
        ? { remediationComplexity: input.data.remediationComplexity }
        : {}),
      ...(input.data.analystNotes !== undefined
        ? { analystNotes: input.data.analystNotes }
        : {}),
      ...(input.data.validationNotes !== undefined
        ? { validationNotes: input.data.validationNotes }
        : {}),
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: priorityChanged
      ? "FINDING_PRIORITY_CHANGED"
      : "FINDING_TRIAGE_UPDATED",
    resourceType: "Finding",
    resourceId: existing.id,
    metadata: {
      from: existing.triagePriority,
      to: input.data.triagePriority,
      assetId: existing.assetId,
      clientId: existing.clientId,
    },
  });

  const detail = await getFindingById(input.organizationId, existing.id);
  if (!detail) throw new Error("Finding not found after triage update");
  return detail;
}

export async function assignFinding(input: {
  organizationId: string;
  actorId: string;
  findingId: string;
  data: AssignFindingInput;
}): Promise<FindingDetail> {
  const existing = await prisma.finding.findFirst({
    where: { id: input.findingId, organizationId: input.organizationId },
  });
  if (!existing) throw new Error("Finding not found");

  if (input.data.assignedToUserId) {
    await assertUserInOrg(input.organizationId, input.data.assignedToUserId);
  }

  assertDueDateNotPast(input.data.dueDate);

  await prisma.finding.update({
    where: { id: existing.id },
    data: {
      assignedToUserId: input.data.assignedToUserId,
      dueDate: input.data.dueDate ? new Date(input.data.dueDate) : null,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "FINDING_ASSIGNED",
    resourceType: "Finding",
    resourceId: existing.id,
    metadata: {
      assignedToUserId: input.data.assignedToUserId,
      dueDate: input.data.dueDate,
      assetId: existing.assetId,
      clientId: existing.clientId,
    },
  });

  const detail = await getFindingById(input.organizationId, existing.id);
  if (!detail) throw new Error("Finding not found after assign");
  return detail;
}

export async function addFindingRemediationNote(input: {
  organizationId: string;
  actorId: string;
  findingId: string;
  note: string;
}): Promise<void> {
  const existing = await prisma.finding.findFirst({
    where: { id: input.findingId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!existing) throw new Error("Finding not found");

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "FINDING_REMEDIATION_NOTE",
    resourceType: "Finding",
    resourceId: existing.id,
    metadata: {
      noteLength: input.note.length,
      note: input.note.slice(0, 500),
    },
  });
}

export async function listFindingActivity(
  organizationId: string,
  findingId: string
) {
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, organizationId },
    select: { id: true },
  });
  if (!finding) return [];

  return prisma.auditLog.findMany({
    where: {
      organizationId,
      resourceType: "Finding",
      resourceId: findingId,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getRecentFindings(
  organizationId: string,
  limit = 5
): Promise<FindingListItem[]> {
  const findings = await prisma.finding.findMany({
    where: {
      organizationId,
      status: { in: UNRESOLVED_FINDING_STATUSES },
    },
    orderBy: { lastDetectedAt: "desc" },
    take: limit,
    include: {
      client: { select: { name: true } },
      asset: { select: { name: true } },
      assignedTo: { select: { name: true } },
      _count: { select: { instances: true } },
    },
  });
  return findings.map(mapListItem);
}

export async function countUnresolvedBySeverity(
  organizationId: string,
  severity: FindingSeverity
): Promise<number> {
  return prisma.finding.count({
    where: {
      organizationId,
      severity,
      status: { in: UNRESOLVED_FINDING_STATUSES },
    },
  });
}

export function guidanceForCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return PASSIVE_REMEDIATION_GUIDANCE[code] ?? null;
}

export { UNRESOLVED_FINDING_STATUSES };
