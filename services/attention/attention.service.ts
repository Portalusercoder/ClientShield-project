/**
 * Derived SOC attention queue — read-time from SecurityEvent, Finding,
 * InvestigationGroup, and Incident. No persisted attention rows.
 *
 * Bounded per-source fetch + in-memory merge/sort/paginate.
 * If any source hits PER_SOURCE_BOUND, `truncated` is true.
 */
import type {
  AttentionSourceType,
  FindingStatus,
  IncidentSeverity,
  IncidentStatus,
  InvestigationStatus,
  SecurityEventSeverity,
  SecurityEventStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildEligibilityGeneration } from "@/services/attention/eligibility-generation";
import { OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import {
  evaluateIncidentSla,
  primaryActiveSlaMetric,
} from "@/services/sla/sla-calculator.service";
import { loadActiveSnapshotsForIncidents } from "@/services/sla/sla-snapshot.service";
import { UNRESOLVED_FINDING_STATUSES } from "@/types/findings";
import type {
  AttentionFilters,
  AttentionItem,
  AttentionListOptions,
  AttentionListResult,
  AttentionSeverity,
  AttentionSummary,
} from "@/types/attention";
import type { SlaState } from "@/types/sla";

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

function overlayDefaults(input: {
  sourceType: AttentionSourceType;
  sourceId: string;
  anchorAt: Date;
  assigneeId: string | null;
  assigneeName: string | null;
}): Pick<
  AttentionItem,
  | "eligibilityGeneration"
  | "acknowledged"
  | "acknowledgedAt"
  | "acknowledgedByUserId"
  | "acknowledgedByName"
  | "ownerUserId"
  | "ownerName"
  | "isClaimed"
  | "isMine"
  | "isSnoozedForCurrentUser"
  | "snoozedUntil"
  | "slaState"
  | "slaMetric"
  | "slaTargetMinutes"
  | "slaElapsedMinutes"
  | "slaRemainingMinutes"
  | "slaDueAt"
> {
  return {
    eligibilityGeneration: buildEligibilityGeneration({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      anchorAt: input.anchorAt,
    }),
    acknowledged: false,
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    acknowledgedByName: null,
    ownerUserId: input.assigneeId,
    ownerName: input.assigneeName,
    isClaimed: Boolean(input.assigneeId),
    isMine: false,
    isSnoozedForCurrentUser: false,
    snoozedUntil: null,
    slaState: "NO_POLICY",
    slaMetric: null,
    slaTargetMinutes: null,
    slaElapsedMinutes: null,
    slaRemainingMinutes: null,
    slaDueAt: null,
  };
}

function slaPriority(state: SlaState): number {
  if (state === "BREACHED") return 2;
  if (state === "APPROACHING") return 1;
  return 0;
}

function compareAttentionItems(a: AttentionItem, b: AttentionItem): number {
  const slaA = slaPriority(a.slaState);
  const slaB = slaPriority(b.slaState);
  if (slaA !== slaB) return slaB - slaA;
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
      ...overlayDefaults({
        sourceType: "SECURITY_EVENT",
        sourceId: row.id,
        anchorAt: row.firstSeenAt,
        assigneeId: null,
        assigneeName: null,
      }),
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
      ...overlayDefaults({
        sourceType: "FINDING",
        sourceId: row.id,
        anchorAt: row.firstDetectedAt,
        assigneeId: row.assignedToUserId,
        assigneeName: row.assignedTo?.name ?? null,
      }),
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
      ...overlayDefaults({
        sourceType: "INVESTIGATION",
        sourceId: row.id,
        anchorAt: row.createdAt,
        assigneeId: null,
        assigneeName: null,
      }),
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
      ...overlayDefaults({
        sourceType: "INCIDENT",
        sourceId: row.id,
        anchorAt: row.detectedAt,
        assigneeId: row.assignedToUserId,
        assigneeName: row.assignedTo?.name ?? null,
      }),
    };
  });

  return { items, hitBound: rows.length >= take };
}

/**
 * Join contractual SLA snapshot evaluation onto INCIDENT attention items only.
 * Finding overdue remains non-SLA. NO_POLICY never becomes BREACHED.
 */
async function enrichWithIncidentSla(
  organizationId: string,
  items: AttentionItem[]
): Promise<AttentionItem[]> {
  const incidentIds = items
    .filter((i) => i.sourceType === "INCIDENT")
    .map((i) => i.sourceId);
  if (incidentIds.length === 0) return items;

  const [snapshots, clocks] = await Promise.all([
    loadActiveSnapshotsForIncidents({ organizationId, incidentIds }),
    prisma.incident.findMany({
      where: { organizationId, id: { in: incidentIds } },
      select: {
        id: true,
        detectedAt: true,
        acknowledgedAt: true,
        containedAt: true,
        resolvedAt: true,
      },
    }),
  ]);
  const clockById = new Map(clocks.map((c) => [c.id, c]));

  return items.map((item) => {
    if (item.sourceType !== "INCIDENT") return item;
    const snap = snapshots.get(item.sourceId) ?? null;
    const clock = clockById.get(item.sourceId);
    if (!clock) return item;

    const evaluation = evaluateIncidentSla({
      snapshot: snap,
      clocks: {
        detectedAt: clock.detectedAt,
        acknowledgedAt: clock.acknowledgedAt,
        containedAt: clock.containedAt,
        resolvedAt: clock.resolvedAt,
      },
    });
    const primary = primaryActiveSlaMetric(evaluation);

    return {
      ...item,
      reasons: normalizeReasons([...item.reasons, ...evaluation.reasons]),
      slaState: evaluation.overallState,
      slaMetric: primary?.metric ?? null,
      slaTargetMinutes: primary?.targetMinutes ?? null,
      slaElapsedMinutes: primary?.elapsedMinutes ?? null,
      slaRemainingMinutes: primary?.remainingMinutes ?? null,
      slaDueAt: primary?.dueAt ?? null,
    };
  });
}

/**
 * Join overlay ack/claim/snooze onto derived items. Overlay never resurrects
 * ineligible sources — only enriches current eligibility set.
 */
async function enrichWithOverlayState(
  organizationId: string,
  items: AttentionItem[],
  viewerUserId?: string | null
): Promise<AttentionItem[]> {
  if (items.length === 0) return items;

  const now = new Date();
  const sourceIds = [...new Set(items.map((i) => i.sourceId))];
  const generations = [...new Set(items.map((i) => i.eligibilityGeneration))];

  const [states, snoozes] = await Promise.all([
    prisma.socAttentionState.findMany({
      where: {
        organizationId,
        sourceId: { in: sourceIds },
        eligibilityGeneration: { in: generations },
      },
      include: {
        acknowledgedBy: { select: { id: true, name: true } },
        claimedBy: { select: { id: true, name: true } },
      },
    }),
    viewerUserId
      ? prisma.socAttentionUserSnooze.findMany({
          where: {
            organizationId,
            userId: viewerUserId,
            sourceId: { in: sourceIds },
            eligibilityGeneration: { in: generations },
            snoozedUntil: { gt: now },
          },
        })
      : Promise.resolve([]),
  ]);

  const stateKey = (t: string, id: string, g: string) => `${t}:${id}:${g}`;
  const stateByKey = new Map(
    states.map((s) => [stateKey(s.sourceType, s.sourceId, s.eligibilityGeneration), s])
  );
  const snoozeByKey = new Map(
    snoozes.map((s) => [stateKey(s.sourceType, s.sourceId, s.eligibilityGeneration), s])
  );

  return items.map((item) => {
    const k = stateKey(item.sourceType, item.sourceId, item.eligibilityGeneration);
    const state = stateByKey.get(k);
    const snooze = snoozeByKey.get(k);

    // Finding/Incident: native assignee is authoritative for ownership
    const usesNativeOwner =
      item.sourceType === "FINDING" || item.sourceType === "INCIDENT";

    let ownerUserId = item.ownerUserId;
    let ownerName = item.ownerName;
    if (!usesNativeOwner && state?.claimedByUserId) {
      ownerUserId = state.claimedByUserId;
      ownerName = state.claimedBy?.name ?? null;
    }

    const acknowledged = Boolean(state?.acknowledgedAt);
    return {
      ...item,
      acknowledged,
      acknowledgedAt: state?.acknowledgedAt ?? null,
      acknowledgedByUserId: state?.acknowledgedByUserId ?? null,
      acknowledgedByName: state?.acknowledgedBy?.name ?? null,
      ownerUserId,
      ownerName,
      isClaimed: Boolean(ownerUserId),
      isMine: Boolean(viewerUserId && ownerUserId === viewerUserId),
      isSnoozedForCurrentUser: Boolean(snooze),
      snoozedUntil: snooze?.snoozedUntil ?? null,
      assigneeId: ownerUserId,
      assigneeName: ownerName,
    };
  });
}

/**
 * Build a sorted, deduplicated attention list for an organization.
 * Dedup key: (sourceType, sourceId) — one item with combined reasons.
 */
export async function listAttentionItems(
  organizationId: string,
  filters: AttentionFilters = {},
  options: AttentionListOptions = {}
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
    // Base filters that don't depend on overlay
    if (filters.clientId && item.clientId !== filters.clientId) continue;
    if (filters.attribution === "UNATTRIBUTED" && !item.isUnattributed) continue;
    if (filters.attribution === "ATTRIBUTED" && item.isUnattributed) continue;
    if (
      filters.sourceType &&
      filters.sourceType !== "ALL" &&
      item.sourceType !== filters.sourceType
    ) {
      continue;
    }
    if (
      filters.severity &&
      filters.severity !== "ALL" &&
      item.severity !== filters.severity
    ) {
      continue;
    }
    if (
      filters.status &&
      filters.status !== "ALL" &&
      item.sourceStatus !== filters.status
    ) {
      continue;
    }
    if (filters.overdue === "OVERDUE" && !item.overdue) continue;

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

  let merged = await enrichWithOverlayState(
    organizationId,
    [...byKey.values()],
    options.viewerUserId
  );
  merged = await enrichWithIncidentSla(organizationId, merged);

  merged = merged.filter((item) => {
    if (filters.acknowledgement === "ACKNOWLEDGED" && !item.acknowledged) {
      return false;
    }
    if (filters.acknowledgement === "UNACKNOWLEDGED" && item.acknowledged) {
      return false;
    }
    if (filters.ownership === "UNCLAIMED" && item.isClaimed) return false;
    if (filters.ownership === "MINE" && !item.isMine) return false;
    const snoozeMode = filters.snooze ?? "ACTIVE";
    if (snoozeMode === "ACTIVE" && item.isSnoozedForCurrentUser) return false;
    if (snoozeMode === "SNOOZED" && !item.isSnoozedForCurrentUser) return false;
    const slaMode = filters.sla ?? "ALL";
    if (slaMode === "ON_TRACK" && item.slaState !== "ON_TRACK") return false;
    if (slaMode === "APPROACHING" && item.slaState !== "APPROACHING") {
      return false;
    }
    if (slaMode === "BREACHED" && item.slaState !== "BREACHED") return false;
    return true;
  });

  merged.sort(compareAttentionItems);
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
 * Intentionally ignores personal snooze so org-wide counts stay team-visible.
 */
export async function getAttentionSummary(
  organizationId: string,
  options?: { topN?: number }
): Promise<AttentionSummary> {
  const topN = options?.topN ?? DASHBOARD_TOP_N;
  const full = await listAttentionItems(
    organizationId,
    {
      page: 1,
      pageSize: ATTENTION_PER_SOURCE_BOUND * 4,
      snooze: "ALL",
    },
    { viewerUserId: null }
  );

  const bySourceType: Record<AttentionSourceType, number> = {
    SECURITY_EVENT: 0,
    FINDING: 0,
    INVESTIGATION: 0,
    INCIDENT: 0,
  };

  let critical = 0;
  let high = 0;
  let overdue = 0;
  let slaBreached = 0;
  let slaApproaching = 0;
  for (const item of full.items) {
    bySourceType[item.sourceType] += 1;
    if (item.severity === "CRITICAL") critical += 1;
    if (item.severity === "HIGH") high += 1;
    if (item.overdue) overdue += 1;
    if (item.slaState === "BREACHED") slaBreached += 1;
    if (item.slaState === "APPROACHING") slaApproaching += 1;
  }

  const policyCount = await prisma.slaPolicy.count({
    where: { organizationId, enabled: true },
  });

  return {
    total: full.total,
    critical,
    high,
    overdue,
    slaBreached,
    slaApproaching,
    hasSlaPolicies: policyCount > 0,
    bySourceType,
    topItems: full.items.slice(0, topN),
    truncated: full.truncated,
  };
}
