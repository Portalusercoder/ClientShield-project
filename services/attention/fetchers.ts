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
import { OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import {
  evaluateIncidentSla,
  primaryActiveSlaMetric,
} from "@/services/sla/sla-calculator.service";
import { loadActiveSnapshotsForIncidents } from "@/services/sla/sla-snapshot.service";
import { UNRESOLVED_FINDING_STATUSES } from "@/types/findings";
import type { AttentionFilters, AttentionItem, AttentionSeverity } from "@/types/attention";
import {
  itemKey,
  normalizeReasons,
  overlayDefaults,
  severityRank,
} from "@/services/attention/attention-compare";

const SE_STATUSES: SecurityEventStatus[] = ["NEW", "REVIEWING"];
const SE_SEVERITIES: SecurityEventSeverity[] = ["CRITICAL", "HIGH"];
const FINDING_SEVERITIES = ["CRITICAL", "HIGH"] as const;
const INV_STATUSES: InvestigationStatus[] = [
  "OPEN",
  "INVESTIGATING",
  "IN_PROGRESS",
  "PENDING",
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

export async function fetchSecurityEventItems(
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
      href: `/security-events/${row.id}`,
      ...overlayDefaults({
        sourceType: "SECURITY_EVENT",
        sourceId: row.id,
        anchorAt: row.firstSeenAt,
        assignedToUserId: null,
        assignedToName: null,
      }),
    };
  });

  return { items, hitBound: rows.length >= take };
}

export async function fetchFindingItems(
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
      href: `/vulnerabilities/${row.id}`,
      ...overlayDefaults({
        sourceType: "FINDING",
        sourceId: row.id,
        anchorAt: row.firstDetectedAt,
        assignedToUserId: row.assignedToUserId,
        assignedToName: row.assignedTo?.name ?? null,
      }),
    });
  }

  return { items, hitBound: rows.length >= take };
}

export async function fetchInvestigationItems(
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
      assignedToUserId: true,
      assignedTo: { select: { id: true, name: true } },
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
      ...(row.assignedToUserId ? [] : ["Unassigned"]),
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
      href: `/investigations/${row.id}`,
      ...overlayDefaults({
        sourceType: "INVESTIGATION",
        sourceId: row.id,
        anchorAt: row.createdAt,
        assignedToUserId: row.assignedToUserId,
        assignedToName: row.assignedTo?.name ?? null,
      }),
    };
  });

  return { items, hitBound: rows.length >= take };
}

export async function fetchIncidentItems(
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
      href: `/incidents/${row.id}`,
      ...overlayDefaults({
        sourceType: "INCIDENT",
        sourceId: row.id,
        anchorAt: row.detectedAt,
        assignedToUserId: row.assignedToUserId,
        assignedToName: row.assignedTo?.name ?? null,
      }),
    };
  });

  return { items, hitBound: rows.length >= take };
}

/**
 * Join contractual SLA snapshot evaluation onto INCIDENT attention items only.
 * Finding overdue remains non-SLA. NO_POLICY never becomes BREACHED.
 */
export async function enrichWithIncidentSla(
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
export async function enrichWithOverlayState(
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
    const mode = item.ownershipMode;

    const claimedByUserId =
      mode === "CLAIM_OVERLAY" ? (state?.claimedByUserId ?? null) : null;
    const claimedByName =
      mode === "CLAIM_OVERLAY" ? (state?.claimedBy?.name ?? null) : null;
    const claimedAt =
      mode === "CLAIM_OVERLAY" ? (state?.claimedAt ?? null) : null;

    // Finding/Incident: claim UI maps to formal assignment (no overlay claim row).
    const isClaimed =
      mode === "NATIVE_ASSIGN"
        ? Boolean(item.assignedToUserId)
        : Boolean(claimedByUserId);
    const isAssigned = Boolean(item.assignedToUserId);

    const ownerUserId =
      mode === "NATIVE_ASSIGN" ? item.assignedToUserId : claimedByUserId;
    const ownerName =
      mode === "NATIVE_ASSIGN" ? item.assignedToName : claimedByName;

    const acknowledged = Boolean(state?.acknowledgedAt);
    return {
      ...item,
      acknowledged,
      acknowledgedAt: state?.acknowledgedAt ?? null,
      acknowledgedByUserId: state?.acknowledgedByUserId ?? null,
      acknowledgedByName: state?.acknowledgedBy?.name ?? null,
      claimedByUserId,
      claimedByName,
      claimedAt,
      isClaimed,
      isAssigned,
      ownerUserId,
      ownerName,
      isMine: Boolean(viewerUserId && ownerUserId === viewerUserId),
      isSnoozedForCurrentUser: Boolean(snooze),
      snoozedUntil: snooze?.snoozedUntil ?? null,
      assigneeId: ownerUserId,
      assigneeName: ownerName,
    };
  });
}
