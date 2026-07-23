/**
 * Derived SOC attention queue types.
 * Overlay ack/claim/snooze is joined at read time; eligibility stays derived.
 * Contractual SLA (INCIDENT snapshots) is joined at read time.
 */
import type { AttentionSourceType } from "@prisma/client";
import type { AttentionSlaFilter, SlaMetric, SlaState } from "@/types/sla";

export type { AttentionSourceType };
export type { AttentionSlaFilter };

export type AttentionSeverity = "CRITICAL" | "HIGH";

export type AttentionAttributionFilter = "ALL" | "ATTRIBUTED" | "UNATTRIBUTED";

export type AttentionOverdueFilter = "ALL" | "OVERDUE";

export type AttentionAckFilter = "ALL" | "UNACKNOWLEDGED" | "ACKNOWLEDGED";

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
  /** Legacy alias — prefer ownerUserId */
  assigneeId: string | null;
  assigneeName: string | null;
  href: string;
  // Overlay / normalized ownership
  acknowledged: boolean;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  acknowledgedByName: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  isClaimed: boolean;
  isMine: boolean;
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
