import { prisma } from "@/lib/db";
import {
  buildEmptySeries,
  fillSeries,
} from "@/services/analytics/shared";
import type {
  AnalyticsRangeDays,
  SecurityEventAnalytics,
} from "@/types/analytics";

export async function getSecurityEventAnalytics(input: {
  organizationId: string;
  rangeDays: AnalyticsRangeDays;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<SecurityEventAnalytics> {
  const { organizationId, rangeDays, rangeStart, rangeEnd } = input;
  const empty = buildEmptySeries(rangeStart, rangeEnd, rangeDays);

  const [ingestedRows, convertedCount, severityGroups, sourceGroups, assetGroups] =
    await Promise.all([
      prisma.securityEvent.findMany({
        where: {
          organizationId,
          firstSeenAt: { gte: rangeStart, lte: rangeEnd },
        },
        select: { firstSeenAt: true },
        take: 8000,
      }),
      prisma.investigationGroupEvent.count({
        where: {
          organizationId,
          removedAt: null,
          addedAt: { gte: rangeStart, lte: rangeEnd },
        },
      }),
      prisma.securityEvent.groupBy({
        by: ["severity"],
        where: {
          organizationId,
          firstSeenAt: { gte: rangeStart, lte: rangeEnd },
        },
        _count: { _all: true },
      }),
      prisma.securityEvent.groupBy({
        by: ["source"],
        where: {
          organizationId,
          firstSeenAt: { gte: rangeStart, lte: rangeEnd },
        },
        _count: { _all: true },
        orderBy: { _count: { source: "desc" } },
        take: 10,
      }),
      prisma.securityEvent.groupBy({
        by: ["assetId"],
        where: {
          organizationId,
          firstSeenAt: { gte: rangeStart, lte: rangeEnd },
          assetId: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { assetId: "desc" } },
        take: 10,
      }),
    ]);

  const assetIds = assetGroups
    .map((a) => a.assetId)
    .filter((id): id is string => Boolean(id));
  const assets = assetIds.length
    ? await prisma.asset.findMany({
        where: { organizationId, id: { in: assetIds } },
        select: { id: true, name: true },
      })
    : [];
  const assetName = new Map(assets.map((a) => [a.id, a.name]));

  const ingested = ingestedRows.length;
  const converted = convertedCount;

  return {
    ingested,
    convertedToInvestigations: converted,
    alertToInvestigationRatio:
      ingested === 0
        ? null
        : Math.round((converted / ingested) * 1000) / 10,
    severityDistribution: severityGroups
      .map((g) => ({
        key: g.severity,
        label: g.severity,
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    topSources: sourceGroups.map((g) => ({
      id: g.source,
      name: g.source ?? "Unknown",
      count: g._count._all,
    })),
    topAssets: assetGroups.map((g) => ({
      id: g.assetId,
      name: (g.assetId && assetName.get(g.assetId)) || "Unknown asset",
      count: g._count._all,
    })),
    ingestedSeries: fillSeries(
      empty,
      ingestedRows.map((r) => r.firstSeenAt),
      rangeDays
    ),
  };
}
