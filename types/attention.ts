/**
 * Derived SOC attention queue types.
 * Overlay ack/claim/snooze is joined at read time; eligibility stays derived.
 * Contractual SLA (INCIDENT snapshots) is joined at read time.
 *
 * Ownership vocabulary (Phase 6b3):
 * - Acknowledged = reviewed (overlay)
 * - Claimed = temporary work lock (overlay for SE/Inv; Finding/Incident use Assign)
 * - Assigned = formal ownership on the source object
 */
import type { AttentionSourceType } from "@prisma/client";
import type { AttentionSlaFilter, SlaMetric, SlaState } from "@/types/sla";
import type { AttentionOwnershipMode } from "@/lib/ownership/model";

export type { AttentionSourceType };
export type { AttentionSlaFilter };
export type { AttentionOwnershipMode };

export type AttentionSeverity = "CRITICAL" | "HIGH";

export type AttentionAttributionFilter = "ALL" | "ATTRIBUTED" | "UNATTRIBUTED";

export type AttentionOverdueFilter = "ALL" | "OVERDUE";

export type AttentionAckFilter = "ALL" | "UNACKNOWLEDGED" | "ACKNOWLEDGED";

/** Claim / assign availability filter (see ownershipMode per source). */
export type AttentionOwnershipFilter = "ALL" | "UNCLAIMED" | "MINE";

/** ACTIVE = hide personal snooze (default). SNOOZED = only snoozed. ALL = include both. */
export type AttentionSnoozeFilter = "ACTIVE" | "SNOOZED" | "ALL";

export interface AttentionItem {
  /** Deterministic: `${sourceType}:${sourceId}` */
  key: string;
  sourceType: AttentionSourceType;
  sourceId: string;
  organizationId: string;
  eligibilityGeneration: string;
  clientId: string | null;
  clientName: string | null;
  isUnattributed: boolean;
  assetId: string | null;
  assetName: string | null;
  severity: AttentionSeverity;
  severityRank: number;
  sourceRank: number;
  title: string;
  reasons: string[];
  sourceStatus: string;
  waitingSince: Date;
  dueDate: Date | null;
  overdue: boolean;
  href: string;
  /** How Attention ownership is stored for this source type. */
  ownershipMode: AttentionOwnershipMode;
  // Acknowledgement (overlay review — not formal ownership)
  acknowledged: boolean;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  acknowledgedByName: string | null;
  // Claim (temporary work lock)
  claimedByUserId: string | null;
  claimedByName: string | null;
  claimedAt: Date | null;
  isClaimed: boolean;
  // Formal assignment (source native assignee)
  assignedToUserId: string | null;
  assignedToName: string | null;
  isAssigned: boolean;
  /**
   * Effective queue ownership for filters:
   * CLAIM_OVERLAY → claim holder; NATIVE_ASSIGN → assignee.
   * Prefer claimedBy* / assignedTo* for display.
   */
  ownerUserId: string | null;
  ownerName: string | null;
  isMine: boolean;
  /** @deprecated Prefer assignedToUserId / claimedByUserId */
  assigneeId: string | null;
  /** @deprecated Prefer assignedToName / claimedByName */
  assigneeName: string | null;
  isSnoozedForCurrentUser: boolean;
  snoozedUntil: Date | null;
  // Contractual SLA (INCIDENT only)
  slaState: SlaState;
  slaMetric: SlaMetric | null;
  slaTargetMinutes: number | null;
  slaElapsedMinutes: number | null;
  slaRemainingMinutes: number | null;
  slaDueAt: Date | null;
}

export interface AttentionFilters {
  clientId?: string;
  sourceType?: AttentionSourceType | "ALL";
  severity?: AttentionSeverity | "ALL";
  status?: string | "ALL";
  attribution?: AttentionAttributionFilter;
  overdue?: AttentionOverdueFilter;
  acknowledgement?: AttentionAckFilter;
  ownership?: AttentionOwnershipFilter;
  snooze?: AttentionSnoozeFilter;
  sla?: AttentionSlaFilter;
  page?: number;
  pageSize?: number;
}

export interface AttentionListOptions {
  /** Required for personal snooze + isMine */
  viewerUserId?: string | null;
}

export interface AttentionListResult {
  items: AttentionItem[];
  total: number;
  page: number;
  pageSize: number;
  truncated: boolean;
  perSourceBound: number;
}

export interface AttentionSummary {
  total: number;
  critical: number;
  high: number;
  overdue: number;
  slaBreached: number;
  slaApproaching: number;
  hasSlaPolicies: boolean;
  bySourceType: Record<AttentionSourceType, number>;
  topItems: AttentionItem[];
  truncated: boolean;
}

export type AttentionSnoozePreset =
  | "MINUTES_15"
  | "HOUR_1"
  | "HOURS_4"
  | "UNTIL_TOMORROW"
  | "CUSTOM";
