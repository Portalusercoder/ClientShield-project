/**
 * Phase 6C1 — SOC Analyst Dashboard unit + smoke tests.
 */
import assert from "node:assert/strict";
import {
  formatAgeMs,
  formatMeanMs,
  maxSeverity,
  oldestAgeMs,
  severityRank,
  startOfUtcDay,
} from "@/services/dashboard/dashboard-aggregates";
import { getSocAnalystDashboard } from "@/services/dashboard/soc-dashboard.service";
import { prisma } from "@/lib/db";
import { DEV_USER_ID } from "@/lib/dev-constants";

function testAggregates() {
  assert.equal(severityRank("CRITICAL"), 5);
  assert.equal(severityRank("INFO"), 1);
  assert.equal(maxSeverity(["LOW", "CRITICAL", "HIGH"]), "CRITICAL");
  assert.equal(maxSeverity([]), "NONE");

  const older = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const newer = new Date(Date.now() - 30 * 60 * 1000);
  const age = oldestAgeMs([newer, older]);
  assert.ok(age != null && age >= 2.5 * 60 * 60 * 1000);

  assert.equal(formatAgeMs(null), "—");
  assert.match(formatAgeMs(45 * 60_000), /m$/);
  assert.equal(formatMeanMs(null), "N/A");
  assert.match(formatMeanMs(3_600_000), /h$/);

  const start = startOfUtcDay();
  assert.equal(start.getUTCHours(), 0);
  assert.equal(start.getUTCMinutes(), 0);
}

async function testDashboardSmoke() {
  const user = await prisma.user.findUnique({ where: { id: DEV_USER_ID } });
  if (!user) {
    console.log("Skip dashboard smoke — DEV_USER_ID not in database");
    return;
  }

  const data = await getSocAnalystDashboard({
    organizationId: user.organizationId,
    userId: user.id,
  });

  assert.equal(data.myWork.length, 4);
  assert.ok(data.myWork.every((c) => typeof c.count === "number"));
  assert.ok(typeof data.sla.atRisk === "number");
  assert.ok(typeof data.sla.breached === "number");
  assert.ok(typeof data.sla.withinSla === "number");
  assert.ok(typeof data.sla.upcomingEscalations === "number");
  assert.ok(typeof data.securityEvents.newToday === "number");
  assert.ok(Array.isArray(data.securityEvents.recent));
  assert.ok(typeof data.investigations.open === "number");
  assert.ok(Array.isArray(data.investigations.recentlyUpdated));
  assert.ok(typeof data.incidents.open === "number");
  assert.ok(typeof data.findings.open === "number");
  assert.ok(typeof data.notifications.unreadCount === "number");
  assert.ok(["ok", "degraded", "error"].includes(data.systemHealth.overallStatus));
  assert.equal(data.slaStateLabels.atRisk, "APPROACHING");
  assert.equal(data.slaStateLabels.breached, "BREACHED");
  assert.equal(data.slaStateLabels.withinSla, "ON_TRACK");
}

async function main() {
  testAggregates();
  console.log("OK aggregate helpers");
  await testDashboardSmoke();
  console.log("OK soc dashboard smoke");
  console.log("Results: passed");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
