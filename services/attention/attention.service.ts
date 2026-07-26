/**
 * Derived SOC attention queue — read-time from SecurityEvent, Finding,
 * InvestigationGroup, and Incident. No persisted attention rows.
 *
 * Bounded per-source fetch + in-memory merge/sort/paginate.
 * If any source hits PER_SOURCE_BOUND, `truncated` is true.
 */
import type { AttentionSourceType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { compareAttentionItems, normalizeReasons } from "@/services/attention/attention-compare";
import {
  enrichWithIncidentSla,
  enrichWithOverlayState,
  fetchFindingItems,
  fetchIncidentItems,
  fetchInvestigationItems,
  fetchSecurityEventItems,
} from "@/services/attention/fetchers";
import type {
  AttentionFilters,
  AttentionItem,
  AttentionListOptions,
  AttentionListResult,
  AttentionSummary,
} from "@/types/attention";

/** Max rows loaded per source type before merge. */
export const ATTENTION_PER_SOURCE_BOUND = 150;

const DEFAULT_PAGE_SIZE = 25;
const DASHBOARD_TOP_N = 8;

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
