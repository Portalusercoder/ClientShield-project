import { prisma } from "@/lib/db";
import { UNRESOLVED_FINDING_STATUSES } from "@/types/findings";
import {
  buildEmptySeries,
  fillSeries,
  positiveDiffMs,
} from "@/services/analytics/shared";
import type {
  AnalyticsRangeDays,
  FindingAnalytics,
} from "@/types/analytics";

const RESOLVED_FINDING_STATUSES = [
  "RESOLVED",
  "FALSE_POSITIVE",
  "ACCEPTED_RISK",
] as const;

export async function getFindingAnalytics(input: {
  organizationId: string;
  rangeDays: AnalyticsRangeDays;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<FindingAnalytics> {
  const { organizationId, rangeDays, rangeStart, rangeEnd } = input;
  const empty = buildEmptySeries(rangeStart, rangeEnd, rangeDays);
  const now = new Date();

  const [
    newRows,
    resolvedRows,
    severityGroups,
    openFindings,
    codeGroups,
  ] = await Promise.all([
    prisma.finding.findMany({
      where: {
        organizationId,
        firstDetectedAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { firstDetectedAt: true },
      take: 5000,
    }),
    prisma.finding.findMany({
      where: {
        organizationId,
        status: { in: [...RESOLVED_FINDING_STATUSES] },
        resolvedAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { resolvedAt: true, firstDetectedAt: true },
      take: 5000,
    }),
    prisma.finding.groupBy({
      by: ["severity"],
      where: {
        organizationId,
        firstDetectedAt: { gte: rangeStart, lte: rangeEnd },
      },
      _count: { _all: true },
    }),
    prisma.finding.findMany({
      where: {
        organizationId,
        status: { in: UNRESOLVED_FINDING_STATUSES },
      },
      select: {
        id: true,
        title: true,
        severity: true,
        firstDetectedAt: true,
      },
      orderBy: { firstDetectedAt: "asc" },
      take: 500,
    }),
    prisma.finding.groupBy({
      by: ["code"],
      where: {
        organizationId,
        firstDetectedAt: { gte: rangeStart, lte: rangeEnd },
        code: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { code: "desc" } },
      take: 10,
    }),
  ]);

  const ages = openFindings
    .map((f) => positiveDiffMs(f.firstDetectedAt, now))
    .filter((v): v is number => v != null);
  const averageAgeMs =
    ages.length === 0
      ? null
      : ages.reduce((a, b) => a + b, 0) / ages.length;

  const newCount = newRows.length;
  const resolvedCount = resolvedRows.length;

  return {
    newFindings: newCount,
    resolvedFindings: resolvedCount,
    remediationRate:
      newCount === 0
        ? null
        : Math.round((resolvedCount / newCount) * 1000) / 10,
    severityDistribution: severityGroups
      .map((g) => ({
        key: g.severity,
        label: g.severity,
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    averageAgeMs,
    oldestFindings: openFindings.slice(0, 10).map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      ageMs: Math.max(0, now.getTime() - f.firstDetectedAt.getTime()),
      firstDetectedAt: f.firstDetectedAt.toISOString(),
    })),
    topRecurringTypes: codeGroups.map((g) => ({
      id: g.code,
      name: g.code ?? "Unknown",
      count: g._count._all,
    })),
    newSeries: fillSeries(
      empty,
      newRows.map((r) => r.firstDetectedAt),
      rangeDays
    ),
    resolvedSeries: fillSeries(
      empty,
      resolvedRows
        .map((r) => r.resolvedAt)
        .filter((d): d is Date => d != null),
      rangeDays
    ),
  };
}
