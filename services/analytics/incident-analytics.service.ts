import { prisma } from "@/lib/db";
import { OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import {
  buildEmptySeries,
  fillSeries,
} from "@/services/analytics/shared";
import type {
  AnalyticsNamedCount,
  AnalyticsRangeDays,
  IncidentAnalytics,
} from "@/types/analytics";

const AGE_BUCKETS = [
  { key: "0_1d", label: "< 1 day", maxMs: 86_400_000 },
  { key: "1_3d", label: "1–3 days", maxMs: 3 * 86_400_000 },
  { key: "3_7d", label: "3–7 days", maxMs: 7 * 86_400_000 },
  { key: "7_30d", label: "7–30 days", maxMs: 30 * 86_400_000 },
  { key: "30d_plus", label: "> 30 days", maxMs: Infinity },
] as const;

export async function getIncidentAnalytics(input: {
  organizationId: string;
  rangeDays: AnalyticsRangeDays;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<IncidentAnalytics> {
  const { organizationId, rangeDays, rangeStart, rangeEnd } = input;
  const empty = buildEmptySeries(rangeStart, rangeEnd, rangeDays);

  const [
    createdRows,
    resolvedRows,
    criticalRows,
    severityGroups,
    categoryGroups,
    openAges,
    assetTop,
    clientTop,
  ] = await Promise.all([
    prisma.incident.findMany({
      where: {
        organizationId,
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { createdAt: true, severity: true, detectedAt: true },
      take: 5000,
    }),
    prisma.incident.findMany({
      where: {
        organizationId,
        resolvedAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { resolvedAt: true, detectedAt: true },
      take: 5000,
    }),
    prisma.incident.findMany({
      where: {
        organizationId,
        severity: "CRITICAL",
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { createdAt: true },
      take: 5000,
    }),
    prisma.incident.groupBy({
      by: ["severity"],
      where: {
        organizationId,
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
      _count: { _all: true },
    }),
    prisma.incident.groupBy({
      by: ["category"],
      where: {
        organizationId,
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
      _count: { _all: true },
      orderBy: { _count: { category: "desc" } },
      take: 10,
    }),
    prisma.incident.findMany({
      where: {
        organizationId,
        status: { in: OPEN_INCIDENT_STATUSES },
      },
      select: { detectedAt: true },
      take: 2000,
    }),
    prisma.incident.groupBy({
      by: ["assetId"],
      where: {
        organizationId,
        createdAt: { gte: rangeStart, lte: rangeEnd },
        assetId: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { assetId: "desc" } },
      take: 10,
    }),
    prisma.incident.groupBy({
      by: ["clientId"],
      where: {
        organizationId,
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
      _count: { _all: true },
      orderBy: { _count: { clientId: "desc" } },
      take: 10,
    }),
  ]);

  const assetIds = assetTop
    .map((r) => r.assetId)
    .filter((id): id is string => Boolean(id));
  const clientIds = clientTop.map((r) => r.clientId);

  const [assets, clients] = await Promise.all([
    assetIds.length
      ? prisma.asset.findMany({
          where: { organizationId, id: { in: assetIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    clientIds.length
      ? prisma.client.findMany({
          where: { organizationId, id: { in: clientIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const assetName = new Map(assets.map((a) => [a.id, a.name]));
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const now = Date.now();
  const ageCounts = AGE_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    count: 0,
  }));
  for (const row of openAges) {
    const age = now - row.detectedAt.getTime();
    const bucket = AGE_BUCKETS.find((b) => age < b.maxMs) ?? AGE_BUCKETS[AGE_BUCKETS.length - 1];
    const target = ageCounts.find((a) => a.key === bucket.key);
    if (target) target.count += 1;
  }

  // Resolution velocity: resolved count per day (same as resolved series)
  const resolvedDates = resolvedRows
    .map((r) => r.resolvedAt)
    .filter((d): d is Date => d != null);

  const topAssets: AnalyticsNamedCount[] = assetTop.map((r) => ({
    id: r.assetId,
    name: (r.assetId && assetName.get(r.assetId)) || "Unknown asset",
    count: r._count._all,
  }));
  const topClients: AnalyticsNamedCount[] = clientTop.map((r) => ({
    id: r.clientId,
    name: clientName.get(r.clientId) ?? "Unknown client",
    count: r._count._all,
  }));

  return {
    createdSeries: fillSeries(
      empty,
      createdRows.map((r) => r.createdAt),
      rangeDays
    ),
    resolvedSeries: fillSeries(empty, resolvedDates, rangeDays),
    criticalSeries: fillSeries(
      empty,
      criticalRows.map((r) => r.createdAt),
      rangeDays
    ),
    severityDistribution: severityGroups
      .map((g) => ({
        key: g.severity,
        label: g.severity,
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    resolutionVelocitySeries: fillSeries(empty, resolvedDates, rangeDays),
    ageDistribution: ageCounts,
    topCategories: categoryGroups.map((g) => ({
      id: g.category,
      name: g.category,
      count: g._count._all,
    })),
    topAssets,
    topClients,
    totals: {
      created: createdRows.length,
      resolved: resolvedRows.length,
      criticalCreated: criticalRows.length,
    },
  };
}
