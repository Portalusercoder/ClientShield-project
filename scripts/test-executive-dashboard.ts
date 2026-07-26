/**
 * Phase 6C2 — Executive Dashboard unit + smoke tests.
 */
import assert from "node:assert/strict";
import {
  calculateExecutivePostureScore,
  gradeFromScore,
  EXECUTIVE_POSTURE_WEIGHTS,
} from "@/services/dashboard/executive-posture.service";
import { getExecutiveDashboard } from "@/services/dashboard/executive-dashboard.service";
import { getSocAnalystDashboard } from "@/services/dashboard/soc-dashboard.service";
import { prisma } from "@/lib/db";
import { DEV_USER_ID } from "@/lib/dev-constants";

function testPostureScoring() {
  assert.equal(gradeFromScore(95), "A");
  assert.equal(gradeFromScore(85), "B");
  assert.equal(gradeFromScore(75), "C");
  assert.equal(gradeFromScore(65), "D");
  assert.equal(gradeFromScore(10), "F");

  const clean = calculateExecutivePostureScore({
    criticalIncidents: 0,
    criticalFindings: 0,
    breachedSla: 0,
    openInvestigations: 0,
    openSecurityEvents: 0,
  });
  assert.equal(clean.score, 100);
  assert.equal(clean.grade, "A");
  assert.equal(clean.deductions.total, 0);

  const risk = calculateExecutivePostureScore({
    criticalIncidents: 2,
    criticalFindings: 3,
    breachedSla: 1,
    openInvestigations: 4,
    openSecurityEvents: 10,
  });
  assert.ok(risk.score < 100);
  assert.ok(risk.deductions.criticalIncidents > 0);
  assert.ok(risk.deductions.breachedSla > 0);
  assert.equal(
    risk.deductions.total,
    risk.deductions.criticalIncidents +
      risk.deductions.criticalFindings +
      risk.deductions.breachedSla +
      risk.deductions.openInvestigations +
      risk.deductions.openSecurityEvents
  );

  // Caps apply
  const capped = calculateExecutivePostureScore({
    criticalIncidents: 100,
    criticalFindings: 100,
    breachedSla: 100,
    openInvestigations: 100,
    openSecurityEvents: 1000,
  });
  assert.equal(
    capped.deductions.criticalIncidents,
    EXECUTIVE_POSTURE_WEIGHTS.criticalIncidentCap
  );
  assert.equal(
    capped.deductions.openSecurityEvents,
    EXECUTIVE_POSTURE_WEIGHTS.openSecurityEventCap
  );
  assert.equal(capped.score, 0);
  assert.equal(capped.grade, "F");
}

async function testDashboardSmoke() {
  const user = await prisma.user.findUnique({ where: { id: DEV_USER_ID } });
  if (!user) {
    console.log("Skip executive smoke — DEV_USER_ID not in database");
    return;
  }

  const data = await getExecutiveDashboard({
    organizationId: user.organizationId,
  });

  assert.ok(typeof data.kpis.totalClients === "number");
  assert.ok(typeof data.kpis.posture.score === "number");
  assert.ok(["A", "B", "C", "D", "F"].includes(data.kpis.posture.grade));
  assert.ok(typeof data.trends.last7Days.incidentsCreated === "number");
  assert.ok(typeof data.trends.last30Days.securityEventsIngested === "number");
  assert.ok(Array.isArray(data.risk.findingsBySeverity));
  assert.ok(Array.isArray(data.risk.highestRiskAssets));
  assert.ok(typeof data.sla.breached === "number");
  assert.ok(typeof data.operational.attentionQueueSize === "number");
  assert.ok(Array.isArray(data.clients));
  assert.ok(["ok", "degraded", "error"].includes(data.platformHealth.overallStatus));
  assert.ok(data.platformHealth.buildVersion);

  // Regression: SOC dashboard still loads independently
  const soc = await getSocAnalystDashboard({
    organizationId: user.organizationId,
    userId: user.id,
  });
  assert.equal(soc.myWork.length, 4);
}

async function main() {
  testPostureScoring();
  console.log("OK executive posture scoring");
  await testDashboardSmoke();
  console.log("OK executive dashboard smoke + SOC regression");
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
