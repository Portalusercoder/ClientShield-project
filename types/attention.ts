/**
 * Derived SOC attention queue types (read-time; no persisted attention rows).
 */

export type AttentionSourceType =
  | "SECURITY_EVENT"
  | "FINDING"
  | "INVESTIGATION"
  | "INCIDENT";

export type AttentionSeverity = "CRITICAL" | "HIGH";

export type AttentionAttributionFilter = "ALL" | "ATTRIBUTED" | "UNATTRIBUTED";

export type AttentionOverdueFilter = "ALL" | "OVERDUE";

export interface AttentionItem {
  /** Deterministic: `${sourceType}:${sourceId}` */
  key: string;
  sourceType: AttentionSourceType;
  sourceId: string;
  organizationId: string;
  clientId: string | null;
  /** Display name, or null when unattributed */
  clientName: string | null;
  /** True when clientId is null — UI must show "Unattributed" */
  isUnattributed: boolean;
  assetId: string | null;
  assetName: string | null;
  severity: AttentionSeverity;
  /** Higher = more urgent (CRITICAL=100, HIGH=50) */
  severityRank: number;
  /** Incident > Investigation > SecurityEvent > Finding */
  sourceRank: number;
  title: string;
  reasons: string[];
  sourceStatus: string;
  waitingSince: Date;
  dueDate: Date | null;
  overdue: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  href: string;
}

export interface AttentionFilters {
  clientId?: string;
  sourceType?: AttentionSourceType | "ALL";
  severity?: AttentionSeverity | "ALL";
  /** Exact source status string match when set (source-specific enums) */
  status?: string | "ALL";
  attribution?: AttentionAttributionFilter;
  overdue?: AttentionOverdueFilter;
  page?: number;
  pageSize?: number;
}

export interface AttentionListResult {
  items: AttentionItem[];
  total: number;
  page: number;
  pageSize: number;
  /** True when any per-source fetch hit its bound (merge may be incomplete) */
  truncated: boolean;
  perSourceBound: number;
}

export interface AttentionSummary {
  total: number;
  critical: number;
  high: number;
  overdue: number;
  bySourceType: Record<AttentionSourceType, number>;
  topItems: AttentionItem[];
  truncated: boolean;
}
