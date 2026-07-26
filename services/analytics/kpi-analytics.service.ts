import { prisma } from "@/lib/db";
import { calculateIncidentSla } from "@/services/incidents/sla";
import {
  daysAgo,
  durationStats,
  emptyDurationTrends,
  positiveDiffMs,
} from "@/services/analytics/shared";
import type {
  AnalyticsRangeDays,
  DurationMetricWindow,
  DurationMetricWithTrends,
  SecurityKpiAnalytics,
} from "@/types/analytics";

type ClockRow = {
  occurredAt: Date | null;
  detectedAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
};

function windowStats(
  rows: ClockRow[],
  since: Date,
  pick: (row: ClockRow) => number | null,
  anchor: (row: ClockRow) => Date | null
): DurationMetricWindow {
  const samples: number[] = [];
  for (const row of rows) {
    const at = anchor(row);
    if (!at || at < since) continue;
    const ms = pick(row);
    if (ms != null) samples.push(ms);
  }
  return durationStats(samples);
}

function buildTrends(
  rows: ClockRow[],
  rangeDays: AnalyticsRangeDays,
  pick: (row: ClockRow) => number | null,
  anchor: (row: ClockRow) => Date | null
): DurationMetricWithTrends {
  const now = new Date();
  return {
    current: windowStats(rows, daysAgo(rangeDays, now), pick, anchor),
    d7: windowStats(rows, daysAgo(7, now), pick, anchor),
    d30: windowStats(rows, daysAgo(30, now), pick, anchor),
    d90: windowStats(rows, daysAgo(90, now), pick, anchor),
  };
}

/**
 * MTTD / MTTA / MTTR from existing Incident timestamps only.
 * MTTD = detectedAt − occurredAt (when occurredAt present)
 * MTTA / MTTR via calculateIncidentSla(detected→ack / detected→resolve)
 */
export async function getSecurityKpiAnalytics(input: {
  organizationId: string;
  rangeDays: AnalyticsRangeDays;
}): Promise<SecurityKpiAnalytics> {
  const since90 = daysAgo(90);
  const rows = await prisma.incident.findMany({
    where: {
      organizationId: input.organizationId,
      OR: [
        { detectedAt: { gte: since90 } },
        { acknowledgedAt: { gte: since90 } },
        { resolvedAt: { gte: since90 } },
      ],
    },
    select: {
      occurredAt: true,
      detectedAt: true,
      acknowledgedAt: true,
      resolvedAt: true,
    },
    take: 5000,
  });

  if (rows.length === 0) {
    return {
      mttd: emptyDurationTrends(),
      mtta: emptyDurationTrends(),
      mttr: emptyDurationTrends(),
    };
  }

  return {
    mttd: buildTrends(
      rows,
      input.rangeDays,
      (r) => positiveDiffMs(r.occurredAt, r.detectedAt),
      (r) => r.detectedAt
    ),
    mtta: buildTrends(
      rows,
      input.rangeDays,
      (r) =>
        calculateIncidentSla({
          detectedAt: r.detectedAt,
          acknowledgedAt: r.acknowledgedAt,
          containedAt: null,
          resolvedAt: null,
        }).timeToAcknowledgeMs,
      (r) => r.acknowledgedAt
    ),
    mttr: buildTrends(
      rows,
      input.rangeDays,
      (r) =>
        calculateIncidentSla({
          detectedAt: r.detectedAt,
          acknowledgedAt: null,
          containedAt: null,
          resolvedAt: r.resolvedAt,
        }).timeToResolveMs,
      (r) => r.resolvedAt
    ),
  };
}
