import type {
  AnalyticsRangeDays,
  AnalyticsSeriesPoint,
  DurationMetricWindow,
  DurationMetricWithTrends,
} from "@/types/analytics";

export function daysAgo(days: number, from = new Date()): Date {
  return new Date(from.getTime() - days * 86_400_000);
}

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

export function parseRangeDays(raw: string | undefined | null): AnalyticsRangeDays {
  if (raw === "7" || raw === "90") return Number(raw) as AnalyticsRangeDays;
  return 30;
}

export function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const w = idx - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}

export function durationStats(samplesMs: number[]): DurationMetricWindow {
  if (samplesMs.length === 0) {
    return { meanMs: null, medianMs: null, p95Ms: null, sampleCount: 0 };
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    meanMs: sum / sorted.length,
    medianMs: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    sampleCount: sorted.length,
  };
}

export function emptyDurationTrends(): DurationMetricWithTrends {
  const empty = durationStats([]);
  return { current: empty, d7: empty, d30: empty, d90: empty };
}

/** Bucket key YYYY-MM-DD (UTC). */
export function dayKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

/** Monday-start week key (UTC). */
export function weekKey(date: Date): string {
  const d = startOfUtcDay(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function buildEmptySeries(
  rangeStart: Date,
  rangeEnd: Date,
  rangeDays: AnalyticsRangeDays
): AnalyticsSeriesPoint[] {
  const weekly = rangeDays === 90;
  const points: AnalyticsSeriesPoint[] = [];
  const cursor = startOfUtcDay(rangeStart);
  const end = startOfUtcDay(rangeEnd);

  if (weekly) {
    // Align to week start
    const day = cursor.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    cursor.setUTCDate(cursor.getUTCDate() + diff);
    while (cursor <= end) {
      const bucket = cursor.toISOString().slice(0, 10);
      points.push({
        bucket,
        label: `W ${bucket.slice(5)}`,
        value: 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return points;
  }

  while (cursor <= end) {
    const bucket = cursor.toISOString().slice(0, 10);
    points.push({
      bucket,
      label: bucket.slice(5),
      value: 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
}

export function fillSeries(
  empty: AnalyticsSeriesPoint[],
  events: Date[],
  rangeDays: AnalyticsRangeDays
): AnalyticsSeriesPoint[] {
  const map = new Map(empty.map((p) => [p.bucket, p.value]));
  const keyFn = rangeDays === 90 ? weekKey : dayKey;
  for (const d of events) {
    const k = keyFn(d);
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return empty.map((p) => ({ ...p, value: map.get(p.bucket) ?? 0 }));
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "N/A";
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${Math.round(value * 10) / 10}%`;
}

export function positiveDiffMs(
  from: Date | null | undefined,
  to: Date | null | undefined
): number | null {
  if (!from || !to) return null;
  const ms = to.getTime() - from.getTime();
  return ms >= 0 ? ms : null;
}
