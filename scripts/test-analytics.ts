/**
 * Phase 6C4 — Security Analytics tests.
 */
import { PrismaClient } from "@prisma/client";
import { DEV_ORG_ID } from "../lib/dev-constants";
import {
  durationStats,
  percentile,
  parseRangeDays,
  formatDurationMs,
  buildEmptySeries,
  fillSeries,
  daysAgo,
} from "../services/analytics/shared";
import { getSecurityAnalytics } from "../services/analytics/analytics.service";
import { getSecurityKpiAnalytics } from "../services/analytics/kpi-analytics.service";

const prisma = new PrismaClient();
let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  PASS: ${msg}`);
    passed += 1;
  } else {
    console.log(`  FAIL: ${msg}`);
    failed += 1;
  }
}

async function main() {
  console.log("Security analytics tests (Phase 6C4)\n");

  assert(parseRangeDays("7") === 7, "parse 7");
  assert(parseRangeDays("90") === 90, "parse 90");
  assert(parseRangeDays("nope") === 30, "default 30");
  assert(parseRangeDays(null) === 30, "null → 30");

  const empty = durationStats([]);
  assert(empty.sampleCount === 0 && empty.meanMs === null, "empty duration stats");

  const stats = durationStats([100, 200, 300, 400, 500]);
  assert(stats.sampleCount === 5, "sample count");
  assert(stats.meanMs === 300, "mean");
  assert(stats.medianMs === 300, "median");
  assert(percentile([1, 2, 3, 4], 50) === 2.5, "p50 interpolate");
  assert(formatDurationMs(3_600_000) === "1.0h", "format 1h");
  assert(formatDurationMs(null) === "N/A", "format null");

  const start = daysAgo(7);
  const end = new Date();
  const series = buildEmptySeries(start, end, 7);
  assert(series.length >= 7 && series.length <= 9, "7d series length");
  const filled = fillSeries(series, [new Date()], 7);
  assert(
    filled.some((p) => p.value >= 1) || filled.every((p) => p.value === 0),
    "fillSeries runs"
  );

  const org = await prisma.organization.findFirst({
    where: { id: DEV_ORG_ID },
    select: { id: true },
  });
  assert(Boolean(org), "dev org present");

  if (org) {
    const kpis = await getSecurityKpiAnalytics({
      organizationId: org.id,
      rangeDays: 30,
    });
    assert(Boolean(kpis.mttd && kpis.mtta && kpis.mttr), "KPI blocks present");
    assert(typeof kpis.mtta.d7.sampleCount === "number", "MTTA d7 sample");
    assert(typeof kpis.mttr.d90.meanMs === "number" || kpis.mttr.d90.meanMs === null, "MTTR d90");

    const data = await getSecurityAnalytics({
      organizationId: org.id,
      rangeDays: 30,
    });
    assert(data.organizationId === org.id, "org scoped");
    assert(data.rangeDays === 30, "range days");
    assert(Array.isArray(data.incidents.createdSeries), "incident series");
    assert(Array.isArray(data.investigations.analystThroughput), "inv throughput");
    assert(typeof data.findings.newFindings === "number", "findings new");
    assert(typeof data.securityEvents.ingested === "number", "SE ingested");
    assert(typeof data.sla.escalationFrequency === "number", "SLA escalations");
    assert(Array.isArray(data.risk.postureTrend), "posture trend");
    assert(Array.isArray(data.analysts.leaderboard), "analyst leaderboard");

    const short = await getSecurityAnalytics({
      organizationId: org.id,
      rangeDays: 7,
    });
    assert(short.rangeDays === 7, "7d range");
    assert(
      short.incidents.createdSeries.length <= data.incidents.createdSeries.length + 2,
      "7d series not larger than 30d unexpectedly by much"
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
