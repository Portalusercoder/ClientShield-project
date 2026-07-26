/**
 * Pure helpers for SOC dashboard aggregations (Phase 6C1).
 */
import type { FindingSeverity, IncidentSeverity, SecurityEventSeverity } from "@prisma/client";
import type { DashboardSeverity } from "@/types/soc-dashboard";

const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

export function severityRank(severity: string | null | undefined): number {
  if (!severity) return 0;
  return SEVERITY_RANK[severity] ?? 0;
}

export function maxSeverity(
  severities: Array<string | null | undefined>
): DashboardSeverity {
  let best: DashboardSeverity = "NONE";
  let bestRank = 0;
  for (const s of severities) {
    const r = severityRank(s);
    if (r > bestRank && s) {
      bestRank = r;
      best = s as DashboardSeverity;
    }
  }
  return best;
}

export function oldestAgeMs(dates: Array<Date | null | undefined>): number | null {
  const valid = dates.filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
  if (valid.length === 0) return null;
  const oldest = valid.reduce((a, b) => (a.getTime() < b.getTime() ? a : b));
  return Math.max(0, Date.now() - oldest.getTime());
}

export function startOfUtcDay(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

export function formatAgeMs(ms: number | null): string {
  if (ms == null) return "—";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function formatMeanMs(ms: number | null): string {
  if (ms == null) return "N/A";
  const hours = ms / 3_600_000;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export type RankableSeverity =
  | IncidentSeverity
  | FindingSeverity
  | SecurityEventSeverity;
