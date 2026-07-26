import { prisma } from "@/lib/db";
import { ACTIVE_INVESTIGATION_STATUSES } from "@/services/investigations/status-transitions";
import {
  buildEmptySeries,
  durationStats,
  fillSeries,
  positiveDiffMs,
} from "@/services/analytics/shared";
import type {
  AnalyticsRangeDays,
  InvestigationAnalytics,
} from "@/types/analytics";

const COMPLETED_STATUSES = ["RESOLVED", "CLOSED", "DISMISSED"] as const;

export async function getInvestigationAnalytics(input: {
  organizationId: string;
  rangeDays: AnalyticsRangeDays;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<InvestigationAnalytics> {
  const { organizationId, rangeDays, rangeStart, rangeEnd } = input;
  const empty = buildEmptySeries(rangeStart, rangeEnd, rangeDays);

  const [
    startedRows,
    completedRows,
    openNow,
    openAtRangeStartApprox,
    throughput,
  ] = await Promise.all([
    prisma.investigationGroup.findMany({
      where: {
        organizationId,
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { createdAt: true },
      take: 5000,
    }),
    prisma.investigationGroup.findMany({
      where: {
        organizationId,
        status: { in: [...COMPLETED_STATUSES] },
        OR: [
          { closedAt: { gte: rangeStart, lte: rangeEnd } },
          {
            closedAt: null,
            updatedAt: { gte: rangeStart, lte: rangeEnd },
            status: { in: ["RESOLVED", "DISMISSED"] },
          },
        ],
      },
      select: {
        createdAt: true,
        closedAt: true,
        updatedAt: true,
        assignedToUserId: true,
        status: true,
      },
      take: 5000,
    }),
    prisma.investigationGroup.count({
      where: {
        organizationId,
        status: { in: ACTIVE_INVESTIGATION_STATUSES },
      },
    }),
    // Approx backlog at range start: still active now that were created before rangeStart
    // + completed during range that existed before rangeStart
    prisma.investigationGroup.count({
      where: {
        organizationId,
        createdAt: { lt: rangeStart },
        OR: [
          { status: { in: ACTIVE_INVESTIGATION_STATUSES } },
          {
            status: { in: [...COMPLETED_STATUSES] },
            OR: [
              { closedAt: { gte: rangeStart } },
              {
                closedAt: null,
                updatedAt: { gte: rangeStart },
              },
            ],
          },
        ],
      },
    }),
    prisma.investigationGroup.groupBy({
      by: ["assignedToUserId"],
      where: {
        organizationId,
        assignedToUserId: { not: null },
        status: { in: [...COMPLETED_STATUSES] },
        OR: [
          { closedAt: { gte: rangeStart, lte: rangeEnd } },
          {
            closedAt: null,
            updatedAt: { gte: rangeStart, lte: rangeEnd },
          },
        ],
      },
      _count: { _all: true },
      orderBy: { _count: { assignedToUserId: "desc" } },
      take: 15,
    }),
  ]);

  const durations = completedRows
    .map((r) => {
      const end = r.closedAt ?? r.updatedAt;
      return positiveDiffMs(r.createdAt, end);
    })
    .filter((v): v is number => v != null);
  const stats = durationStats(durations);

  const userIds = throughput
    .map((t) => t.assignedToUserId)
    .filter((id): id is string => Boolean(id));
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { organizationId, id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userName = new Map(
    users.map((u) => [u.id, u.name?.trim() || u.email])
  );

  const started = startedRows.length;
  const completed = completedRows.length;
  const backlogAtStart = openAtRangeStartApprox;
  const backlogGrowth = openNow - backlogAtStart;

  const analystsWithWork = new Set(
    completedRows
      .map((r) => r.assignedToUserId)
      .filter((id): id is string => Boolean(id))
  ).size;

  const completedDates = completedRows.map(
    (r) => r.closedAt ?? r.updatedAt
  );

  return {
    started,
    completed,
    averageDurationMs: stats.meanMs,
    medianDurationMs: stats.medianMs,
    backlogGrowth,
    completionRate:
      started === 0 ? null : Math.round((completed / started) * 1000) / 10,
    averagePerAnalyst:
      analystsWithWork === 0
        ? null
        : Math.round((completed / analystsWithWork) * 10) / 10,
    analystThroughput: throughput.map((t) => ({
      id: t.assignedToUserId,
      name:
        (t.assignedToUserId && userName.get(t.assignedToUserId)) ||
        "Unassigned",
      count: t._count._all,
    })),
    startedSeries: fillSeries(
      empty,
      startedRows.map((r) => r.createdAt),
      rangeDays
    ),
    completedSeries: fillSeries(empty, completedDates, rangeDays),
  };
}
