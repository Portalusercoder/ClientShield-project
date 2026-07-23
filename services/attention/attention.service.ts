/**
 * Derived SOC attention queue — read-time from SecurityEvent, Finding,
 * InvestigationGroup, and Incident. No persisted attention rows.
 *
 * Bounded per-source fetch + in-memory merge/sort/paginate.
 * If any source hits PER_SOURCE_BOUND, `truncated` is true.
 */
import type {
  FindingStatus,
  IncidentSeverity,
  IncidentStatus,
  InvestigationStatus,
  SecurityEventSeverity,
  SecurityEventStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import { UNRESOLVED_FINDING_STATUSES } from "@/types/findings";
import type {
  AttentionFilters,
  AttentionItem,
  AttentionListResult,
  AttentionSeverity,
  AttentionSourceType,
  AttentionSummary,
} from "@/types/attention";

/** Max rows loaded per source type before merge. */
export const ATTENTION_PER_SOURCE_BOUND = 150;

const DEFAULT_PAGE_SIZE = 25;
const DASHBOARD_TOP_N = 8;

const SE_STATUSES: SecurityEventStatus[] = ["NEW", "REVIEWING"];
const SE_SEVERITIES: SecurityEventSeverity[] = ["CRITICAL", "HIGH"];
const FINDING_SEVERITIES = ["CRITICAL", "HIGH"] as const;
const INV_STATUSES: InvestigationStatus[] = [
  "OPEN",
  "INVESTIGATING",
  "CONFIRMED",
];
const INV_SEVERITIES: IncidentSeverity[] = ["CRITICAL", "HIGH"];
const INC_SEVERITIES: IncidentSeverity[] = ["CRITICAL", "HIGH"];

const SOURCE_RANK: Record<AttentionSourceType, number> = {
  INCIDENT: 0,
  INVESTIGATION: 1,
  SECURITY_EVENT: 2,
  FINDING: 3,
};

function severityRank(severity: AttentionSeverity): number {
  return severity === "CRITICAL" ? 100 : 50;
}

function itemKey(sourceType: AttentionSourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

function normalizeReasons(reasons: string[]): string[] {
  return [...new Set(reasons.map((r) => r.trim()).filter(Boolean))];
}

function compareAttentionItems(a: AttentionItem, b: AttentionItem): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  if (a.severityRank !== b.severityRank) return b.severityRank - a.severityRank;
  if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
  const ta = a.waitingSince.getTime();
  const tb = b.waitingSince.getTime();
  if (ta !== tb) return ta - tb;
  return a.key.localeCompare(b.key);
}

function clientWhereForAttribution(
  filters: AttentionFilters
): { clientId: string } | { clientId: null } | { clientId: { not: null } } | Record<string, never> {
  if (filters.clientId) {
    return { clientId: filters.clientId };
  }
  if (filters.attribution === "UNATTRIBUTED") {
    return { clientId: null };
  }
  if (filters.attribution === "ATTRIBUTED") {
    return { clientId: { not: null } };
  }
  return {};
}

function passesPostFilters(
  item: AttentionItem,
  filters: AttentionFilters
): boolean {
  if (filters.clientId) {
    if (item.clientId !== filters.clientId) return false;
  }
  if (filters.attribution === "UNATTRIBUTED" && !item.isUnattributed) {
    return false;
  }
  if (filters.attribution === "ATTRIBUTED" && item.isUnattributed) {
    return false;
  }
  if (
    filters.sourceType &&
    filters.sourceType !== "ALL" &&
    item.sourceType !== filters.sourceType
  ) {
    return false;
  }
  if (
    filters.severity &&
    filters.severity !== "ALL" &&
    item.severity !== filters.severity
  ) {
    return false;
  }
  if (
    filters.status &&
    filters.status !== "ALL" &&
    item.sourceStatus !== filters.status
  ) {
    return false;
  }
  if (filters.overdue === "OVERDUE" && !item.overdue) {
    return false;
  }
  return true;
}

function isFindingOverdue(dueDate: Date | null, status: FindingStatus): boolean {
  if (!dueDate) return false;
  if (!UNRESOLVED_FINDING_STATUSES.includes(status)) return false;
  return dueDate.getTime() < Date.now();
}

async function fetchSecurityEventItems(
  organizationId: string,
  filters: AttentionFilters,
  take: number
): Promise<{ items: AttentionItem[]; hitBound: boolean }> {
  if (filters.sourceType && filters.sourceType !== "ALL" && filters.sourceType !== "SECURITY_EVENT") {
    return { items: [], hitBound: false };
  }

  const clientClause = clientWhereForAttribution(filters);
  const statusFilter =
    filters.status && filters.status !== "ALL"
      ? SE_STATUSES.includes(filters.status as SecurityEventStatus)
        ? [filters.status as SecurityEventStatus]
        : ([] as SecurityEventStatus[])
      : SE_STATUSES;

  if (statusFilter.length === 0) {
    return { items: [], hitBound: false };
  }

  const severityFilter =
    filters.severity && filters.severity !== "ALL"
      ? [filters.severity as SecurityEventSeverity]
      : SE_SEVERITIES;

  const rows = await prisma.securityEvent.findMany({
    where: {
      organizationId,
      classification: "ACTIONABLE",
      severity: { in: severityFilter },
      status: { in: statusFilter },
      ...clientClause,
    },
    orderBy: [{ severity: "asc" }, { firstSeenAt: "asc" }],
    take,
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      assetId: true,
      title: true,
      severity: true,
      status: true,
      firstSeenAt: true,
      client: { select: { name: true } },
      asset: { select: { name: true } },
    },
  });

  const items: AttentionItem[] = rows.map((row) => {
    const severity = row.severity as AttentionSeverity;
    const reasons = [
      `${severity} ACTIONABLE security event awaiting review`,
      row.status === "NEW"
        ? "Status NEW — needs analyst triage"
        : "Status REVIEWING — in progress",
    ];
    return {
      key: itemKey("SECURITY_EVENT", row.id),
      sourceType: "SECURITY_EVENT",
      sourceId: row.id,
      organizationId: row.organizationId,
      clientId: row.clientId,
      clientName: row.client?.name ?? null,
      isUnattributed: row.clientId === null,
      assetId: row.assetId,
      assetName: row.asset?.name ?? null,
      severity,
      severityRank: severityRank(severity),
      sourceRank: SOURCE_RANK.SECURITY_EVENT,
      title: row.title,
      reasons: normalizeReasons(reasons),
      sourceStatus: row.status,
      waitingSince: row.firstSeenAt,
      dueDate: null,
      overdue: false,
      assigneeId: null,
      assigneeName: null,
      href: `/security-events/${row.id}`,
    };
  });

  return { items, hitBound: rows.length >= take };
}

async function fetchFindingItems(
  organizationId: string,
  filters: AttentionFilters,
  take: number
): Promise<{ items: AttentionItem[]; hitBound: boolean }> {
  if (filters.sourceType && filters.sourceType !== "ALL" && filters.sourceType !== "FINDING") {
    return { items: [], hitBound: false };
  }

  const statusFilter =
    filters.status && filters.status !== "ALL"
      ? UNRESOLVED_FINDING_STATUSES.includes(filters.status as FindingStatus)
        ? [filters.status as FindingStatus]
        : ([] as FindingStatus[])
      : [...UNRESOLVED_FINDING_STATUSES];

  if (statusFilter.length === 0) {
    return { items: [], hitBound: false };
  }

  const severityFilter =
    filters.severity && filters.severity !== "ALL"
      ? [filters.severity]
      : [...FINDING_SEVERITIES];

  const clientClause = filters.clientId
    ? { clientId: filters.clientId }
    : filters.attribution === "UNATTRIBUTED"
      ? { clientId: null }
      : filters.attribution === "ATTRIBUTED"
        ? { clientId: { not: null } }
        : {};

  const rows = await prisma.finding.findMany({
    where: {
      organizationId,
      severity: { in: severityFilter },
      status: { in: statusFilter },
      ...clientClause,
    },
    orderBy: [{ severity: "asc" }, { firstDetectedAt: "asc" }],
    take,
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      title: true,
      severity: true,
      status: true,
      dueDate: true,
      firstDetectedAt: true,
      assignedToUserId: true,
      assetId: true,
      client: { select: { name: true } },
      asset: {
        select: {
          id: true,
          name: true,
          clientId: true,
          client: { select: { name: true } },
        },
      },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  const items: AttentionItem[] = [];
  for (const row of rows) {
    const clientId = row.clientId ?? null;
    const clientName = row.client?.name ?? null;
    if (filters.clientId && clientId !== filters.clientId) continue;
    if (filters.attribution === "UNATTRIBUTED" && clientId !== null) continue;
    if (filters.attribution === "ATTRIBUTED" && clientId === null) continue;

    const severity = row.severity as AttentionSeverity;
    const overdue = isFindingOverdue(row.dueDate, row.status);
    if (filters.overdue === "OVERDUE" && !overdue) continue;

    const reasons = [
      `${severity} unresolved finding requires triage`,
      ...(overdue ? ["Overdue", "Due date exceeded"] : []),
    ];

    items.push({
      key: itemKey("FINDING", row.id),
      sourceType: "FINDING",
      sourceId: row.id,
      organizationId: row.organizationId,
      clientId,
      clientName,
      isUnattributed: clientId === null,
      assetId: row.assetId,
      assetName: row.asset?.name ?? null,
      severity,
      severityRank: severityRank(severity),
      sourceRank: SOURCE_RANK.FINDING,
      title: row.title,
      reasons: normalizeReasons(reasons),
      sourceStatus: row.status,
      waitingSince: row.firstDetectedAt,
      dueDate: row.dueDate,
      overdue,
      assigneeId: row.assignedToUserId,
      assigneeName: row.assignedTo?.name ?? null,
      href: `/vulnerabilities/${row.id}`,
    });
  }

  return { items, hitBound: rows.length >= take };
}

async function fetchInvestigationItems(
  organizationId: string,
  filters: AttentionFilters,
  take: number
): Promise<{ items: AttentionItem[]; hitBound: boolean }> {
  if (
    filters.sourceType &&
    filters.sourceType !== "ALL" &&
    filters.sourceType !== "INVESTIGATION"
  ) {
    return { items: [], hitBound: false };
  }

  // LINKED_TO_INCIDENT / DISMISSED / CLOSED excluded — work represented by Incident or closed
  const statusFilter =
    filters.status && filters.status !== "ALL"
      ? INV_STATUSES.includes(filters.status as InvestigationStatus)
        ? [filters.status as InvestigationStatus]
        : ([] as InvestigationStatus[])
      : INV_STATUSES;

  if (statusFilter.length === 0) {
    return { items: [], hitBound: false };
  }

  const severityFilter =
    filters.severity && filters.severity !== "ALL"
      ? [filters.severity as IncidentSeverity]
      : INV_SEVERITIES;

  const clientClause = clientWhereForAttribution(filters);

  const rows = await prisma.investigationGroup.findMany({
    where: {
      organizationId,
      severity: { in: severityFilter },
      status: { in: statusFilter },
      ...clientClause,
    },
    orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
    take,
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      assetId: true,
      title: true,
      severity: true,
      status: true,
      createdByType: true,
      createdAt: true,
    },
  });

  const clientIds = [
    ...new Set(rows.map((r) => r.clientId).filter((id): id is string => Boolean(id))),
  ];
  const assetIds = [
    ...new Set(rows.map((r) => r.assetId).filter((id): id is string => Boolean(id))),
  ];
  const [clients, assets] = await Promise.all([
    clientIds.length
      ? prisma.client.findMany({
          where: { organizationId, id: { in: clientIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    assetIds.length
      ? prisma.asset.findMany({
          where: { organizationId, id: { in: assetIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ]);
  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));
  const assetNameById = new Map(assets.map((a) => [a.id, a.name]));

  const items: AttentionItem[] = rows.map((row) => {
    const severity = row.severity as AttentionSeverity;
    const reasons = [
      `${severity} investigation requires analyst attention`,
      row.createdByType === "SYSTEM_SUGGESTED"
        ? "System-suggested investigation"
        : "Analyst-created investigation",
      `Status ${row.status}`,
    ];
    return {
      key: itemKey("INVESTIGATION", row.id),
      sourceType: "INVESTIGATION",
      sourceId: row.id,
      organizationId: row.organizationId,
      clientId: row.clientId,
      clientName: row.clientId
        ? clientNameById.get(row.clientId) ?? null
        : null,
      isUnattributed: row.clientId === null,
      assetId: row.assetId,
      assetName: row.assetId
        ? assetNameById.get(row.assetId) ?? null
        : null,
      severity,
      severityRank: severityRank(severity),
      sourceRank: SOURCE_RANK.INVESTIGATION,
      title: row.title,
      reasons: normalizeReasons(reasons),
      sourceStatus: row.status,
      waitingSince: row.createdAt,
      dueDate: null,
      overdue: false,
      assigneeId: null,
      assigneeName: null,
      href: `/investigations/${row.id}`,
    };
  });

  return { items, hitBound: rows.length >= take };
}

async function fetchIncidentItems(
  organizationId: string,
  filters: AttentionFilters,
  take: number
): Promise<{ items: AttentionItem[]; hitBound: boolean }> {
  if (filters.sourceType && filters.sourceType !== "ALL" && filters.sourceType !== "INCIDENT") {
    return { items: [], hitBound: false };
  }

  // Incident.clientId is required — never unattributed
  if (filters.attribution === "UNATTRIBUTED") {
    return { items: [], hitBound: false };
  }

  const statusFilter =
    filters.status && filters.status !== "ALL"
      ? OPEN_INCIDENT_STATUSES.includes(filters.status as IncidentStatus)
        ? [filters.status as IncidentStatus]
        : ([] as IncidentStatus[])
      : [...OPEN_INCIDENT_STATUSES];

  if (statusFilter.length === 0) {
    return { items: [], hitBound: false };
  }

  const severityFilter =
    filters.severity && filters.severity !== "ALL"
      ? [filters.severity as IncidentSeverity]
      : INC_SEVERITIES;

  const clientClause = filters.clientId
    ? { clientId: filters.clientId }
    : {};

  const rows = await prisma.incident.findMany({
    where: {
      organizationId,
      severity: { in: severityFilter },
      status: { in: statusFilter },
      ...clientClause,
    },
    orderBy: [{ severity: "asc" }, { detectedAt: "asc" }],
    take,
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      assetId: true,
      title: true,
      caseNumber: true,
      severity: true,
      status: true,
      detectedAt: true,
      assignedToUserId: true,
      client: { select: { name: true } },
      asset: { select: { name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  const items: AttentionItem[] = rows.map((row) => {
    const severity = row.severity as AttentionSeverity;
    const reasons = [
      `${severity} open incident requires response`,
      `Status ${row.status}`,
      ...(row.assignedToUserId ? [] : ["Unassigned"]),
    ];
    return {
      key: itemKey("INCIDENT", row.id),
      sourceType: "INCIDENT",
      sourceId: row.id,
      organizationId: row.organizationId,
      clientId: row.clientId,
      clientName: row.client?.name ?? null,
      isUnattributed: row.clientId === null,
      assetId: row.assetId,
      assetName: row.asset?.name ?? null,
      severity,
      severityRank: severityRank(severity),
      sourceRank: SOURCE_RANK.INCIDENT,
      title: row.caseNumber ? `${row.caseNumber}: ${row.title}` : row.title,
      reasons: normalizeReasons(reasons),
      sourceStatus: row.status,
      waitingSince: row.detectedAt,
      dueDate: null,
      overdue: false,
      assigneeId: row.assignedToUserId,
      assigneeName: row.assignedTo?.name ?? null,
      href: `/incidents/${row.id}`,
    };
  });

  return { items, hitBound: rows.length >= take };
}

/**
 * Build a sorted, deduplicated attention list for an organization.
 * Dedup key: (sourceType, sourceId) — one item with combined reasons.
 */
export async function listAttentionItems(
  organizationId: string,
  filters: AttentionFilters = {}
): Promise<AttentionListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
  const bound = ATTENTION_PER_SOURCE_BOUND;

  const [se, findings, investigations, incidents] = await Promise.all([
    fetchSecurityEventItems(organizationId, filters, bound),
    fetchFindingItems(organizationId, filters, bound),
    fetchInvestigationItems(organizationId, filters, bound),
    fetchIncidentItems(organizationId, filters, bound),
  ]);

  const byKey = new Map<string, AttentionItem>();
  for (const item of [
    ...se.items,
    ...findings.items,
    ...investigations.items,
    ...incidents.items,
  ]) {
    if (!passesPostFilters(item, filters)) continue;
    const existing = byKey.get(item.key);
    if (existing) {
      existing.reasons = normalizeReasons([
        ...existing.reasons,
        ...item.reasons,
      ]);
      existing.overdue = existing.overdue || item.overdue;
    } else {
      byKey.set(item.key, { ...item });
    }
  }

  const merged = [...byKey.values()].sort(compareAttentionItems);
  const total = merged.length;
  const start = (page - 1) * pageSize;
  const items = merged.slice(start, start + pageSize);
  const truncated =
    se.hitBound ||
    findings.hitBound ||
    investigations.hitBound ||
    incidents.hitBound;

  return {
    items,
    total,
    page,
    pageSize,
    truncated,
    perSourceBound: bound,
  };
}

/**
 * Summary + top N for dashboard widget — same eligibility as listAttentionItems.
 */
export async function getAttentionSummary(
  organizationId: string,
  options?: { topN?: number }
): Promise<AttentionSummary> {
  const topN = options?.topN ?? DASHBOARD_TOP_N;
  const full = await listAttentionItems(organizationId, {
    page: 1,
    pageSize: ATTENTION_PER_SOURCE_BOUND * 4,
  });

  const bySourceType: Record<AttentionSourceType, number> = {
    SECURITY_EVENT: 0,
    FINDING: 0,
    INVESTIGATION: 0,
    INCIDENT: 0,
  };

  let critical = 0;
  let high = 0;
  let overdue = 0;
  for (const item of full.items) {
    bySourceType[item.sourceType] += 1;
    if (item.severity === "CRITICAL") critical += 1;
    if (item.severity === "HIGH") high += 1;
    if (item.overdue) overdue += 1;
  }

  return {
    total: full.total,
    critical,
    high,
    overdue,
    bySourceType,
    topItems: full.items.slice(0, topN),
    truncated: full.truncated,
  };
}
