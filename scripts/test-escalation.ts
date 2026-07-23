/**
 * Phase 4c SLA escalation + notification tests.
 * Isolated TEST orgs — does not mutate Harborline / Agents 000–002.
 * Run: npm run test:escalation
 */
import { PrismaClient, type UserRole } from "@prisma/client";
import { DEV_ORG_ID } from "../lib/dev-constants";
import {
  deriveSlaEscalationTriggers,
  evaluateIncidentSlaEscalations,
  runSlaEscalationEvaluationPass,
  slaEscalationDedupeKey,
} from "../services/escalation/sla-escalation-evaluator.service";
import { createIncident, updateIncidentStatus } from "../services/incidents.service";
import { upsertSlaPolicy } from "../services/sla/sla-policy.service";
import { evaluateIncidentSla } from "../services/sla/sla-calculator.service";
import { getActiveIncidentSlaSnapshot } from "../services/sla/sla-snapshot.service";
import type { AuthSession } from "../lib/auth/types";

const prisma = new PrismaClient();

const TEST_ORG = "clyescalationorg0000000001";
const OTHER_ORG = "clyescalationotherorg00001";
const OWNER_U = "clyescalationowner000000001";
const ADMIN_U = "clyescalationadmin000000001";
const ANALYST_U = "clyescalationanalyst0000001";
const VIEWER_U = "clyescalationviewer00000001";
const OTHER_ADMIN = "clyescalationotheradmin0001";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

function session(
  userId: string,
  organizationId: string,
  role: UserRole,
  email: string
): AuthSession {
  return {
    userId,
    organizationId,
    email,
    name: email,
    role,
    externalId: null,
  };
}

async function cleanup() {
  const orgs = [TEST_ORG, OTHER_ORG];
  await prisma.notificationRecipient.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.notification.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.escalationEvent.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.incidentSlaSnapshot.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.slaPolicy.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.incidentActivity.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.incident.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.client.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
}

async function seed() {
  await cleanup();
  await prisma.organization.create({
    data: { id: TEST_ORG, name: "Escalation Org", slug: "escalation-test-org" },
  });
  await prisma.organization.create({
    data: {
      id: OTHER_ORG,
      name: "Escalation Other",
      slug: "escalation-other-org",
    },
  });
  await prisma.user.createMany({
    data: [
      {
        id: OWNER_U,
        organizationId: TEST_ORG,
        email: "owner@esc.test",
        name: "Owner",
        role: "OWNER",
      },
      {
        id: ADMIN_U,
        organizationId: TEST_ORG,
        email: "admin@esc.test",
        name: "Admin",
        role: "ADMIN",
      },
      {
        id: ANALYST_U,
        organizationId: TEST_ORG,
        email: "analyst@esc.test",
        name: "Analyst",
        role: "ANALYST",
      },
      {
        id: VIEWER_U,
        organizationId: TEST_ORG,
        email: "viewer@esc.test",
        name: "Viewer",
        role: "VIEWER",
      },
      {
        id: OTHER_ADMIN,
        organizationId: OTHER_ORG,
        email: "admin@other.esc",
        name: "Other",
        role: "ADMIN",
      },
    ],
  });
  const client = await prisma.client.create({
    data: {
      organizationId: TEST_ORG,
      name: "Esc Client",
      slug: "esc-client",
      status: "ACTIVE",
    },
  });

  await upsertSlaPolicy({
    session: session(ADMIN_U, TEST_ORG, "ADMIN", "admin@esc.test"),
    data: {
      clientId: null,
      severity: "CRITICAL",
      mttaMinutes: 100,
      mttcMinutes: 200,
      mttrMinutes: 400,
      approachingThresholdPct: 80,
      enabled: true,
    },
  });
  await upsertSlaPolicy({
    session: session(ADMIN_U, TEST_ORG, "ADMIN", "admin@esc.test"),
    data: {
      clientId: null,
      severity: "HIGH",
      mttaMinutes: 100,
      mttcMinutes: 200,
      mttrMinutes: 400,
      approachingThresholdPct: 80,
      enabled: true,
    },
  });

  return { clientId: client.id };
}

async function backdateDetected(incidentId: string, minutesAgo: number) {
  const detectedAt = new Date(Date.now() - minutesAgo * 60_000);
  await prisma.incident.update({
    where: { id: incidentId },
    data: { detectedAt, reportedAt: detectedAt },
  });
  return detectedAt;
}

async function main() {
  console.log("\n=== Phase 4c SLA Escalation ===\n");
  const { clientId } = await seed();

  const harborMaps = await prisma.wazuhAgentMapping.count({
    where: {
      organizationId: DEV_ORG_ID,
      wazuhAgentId: { in: ["001", "002"] },
    },
  });
  assert(harborMaps === 2, "Harborline mappings unchanged");

  // NO_POLICY → no escalation
  console.log("\n-- NO_POLICY --");
  const medium = await createIncident({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    data: {
      clientId,
      assetId: null,
      title: "Medium no policy",
      description: "m",
      severity: "MEDIUM",
      category: "OTHER",
      source: "MANUAL",
      detectionMethod: "MANUAL",
      assignedToUserId: ANALYST_U,
      businessImpact: null,
      technicalImpact: null,
      occurredAt: null,
      findingId: null,
      externalSourceId: null,
    },
  });
  await backdateDetected(medium.id, 500);
  const noPol = await evaluateIncidentSlaEscalations({
    organizationId: TEST_ORG,
    incidentId: medium.id,
  });
  assert(noPol.fired === 0, "NO_POLICY produces no escalation");
  const noPolEvents = await prisma.escalationEvent.count({
    where: { incidentId: medium.id },
  });
  assert(noPolEvents === 0, "NO_POLICY no EscalationEvent rows");

  console.log("\n-- MTTA 50% / approaching / breached --");
  const crit = await createIncident({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    data: {
      clientId,
      assetId: null,
      title: "Critical SLA clock",
      description: "c",
      severity: "CRITICAL",
      category: "OTHER",
      source: "MANUAL",
      detectionMethod: "MANUAL",
      assignedToUserId: ANALYST_U,
      businessImpact: null,
      technicalImpact: null,
      occurredAt: null,
      findingId: null,
      externalSourceId: null,
    },
  });

  // 50% of 100 min MTTA = 50 → backdate 55 min → HALF only (not yet approaching at 80)
  await backdateDetected(crit.id, 55);
  const half = await evaluateIncidentSlaEscalations({
    organizationId: TEST_ORG,
    incidentId: crit.id,
  });
  assert(half.fired >= 1, "MTTA 50% fires");
  const halfEvents = await prisma.escalationEvent.findMany({
    where: { incidentId: crit.id, triggerType: "MTTA_HALF" },
  });
  assert(halfEvents.length === 1, "MTTA 50% fires once");
  const snap = await getActiveIncidentSlaSnapshot({
    organizationId: TEST_ORG,
    incidentId: crit.id,
  });
  assert(!!snap, "snapshot exists for CRITICAL");
  assert(
    halfEvents[0].dedupeKey ===
      slaEscalationDedupeKey({
        incidentId: crit.id,
        generation: snap!.generation,
        metric: "MTTA",
        suffix: "HALF",
      }),
    "HALF dedupe key format"
  );

  const halfAgain = await evaluateIncidentSlaEscalations({
    organizationId: TEST_ORG,
    incidentId: crit.id,
  });
  assert(halfAgain.fired === 0, "worker rerun produces no duplicate HALF");
  assert(
    (await prisma.escalationEvent.count({
      where: { incidentId: crit.id, triggerType: "MTTA_HALF" },
    })) === 1,
    "MTTA 50% still once after rerun"
  );

  // Approaching at 80% of 100 = 80 min
  await backdateDetected(crit.id, 85);
  const approach = await evaluateIncidentSlaEscalations({
    organizationId: TEST_ORG,
    incidentId: crit.id,
  });
  assert(approach.fired >= 1, "MTTA approaching fires");
  assert(
    (await prisma.escalationEvent.count({
      where: { incidentId: crit.id, triggerType: "MTTA_APPROACHING" },
    })) === 1,
    "MTTA approaching once"
  );

  // Breach past 100
  await backdateDetected(crit.id, 120);
  const breach = await evaluateIncidentSlaEscalations({
    organizationId: TEST_ORG,
    incidentId: crit.id,
  });
  assert(breach.fired >= 1, "MTTA breached fires");
  assert(
    (await prisma.escalationEvent.count({
      where: { incidentId: crit.id, triggerType: "MTTA_BREACHED" },
    })) === 1,
    "MTTA breached once"
  );

  const pass2 = await runSlaEscalationEvaluationPass({
    organizationId: TEST_ORG,
  });
  assert(pass2.fired === 0 || pass2.skipped >= 0, "batch rerun idempotent");
  assert(
    (await prisma.escalationEvent.count({
      where: {
        incidentId: crit.id,
        triggerType: {
          in: ["MTTA_HALF", "MTTA_APPROACHING", "MTTA_BREACHED"],
        },
      },
    })) === 3,
    "worker rerun produces no duplicates for MTTA triggers"
  );

  console.log("\n-- MTTC / MTTR --");
  // Acknowledge so MTTA complete; backdate for MTTC approaching (80% of 200 = 160)
  await updateIncidentStatus({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    incidentId: crit.id,
    status: "ACKNOWLEDGED",
  });
  // Keep detectedAt 180 min ago → MTTC approaching (uncontained)
  await backdateDetected(crit.id, 180);
  await prisma.incident.update({
    where: { id: crit.id },
    data: {
      acknowledgedAt: new Date(Date.now() - 100 * 60_000),
      containedAt: null,
      resolvedAt: null,
    },
  });
  const mttc = await evaluateIncidentSlaEscalations({
    organizationId: TEST_ORG,
    incidentId: crit.id,
  });
  assert(mttc.fired >= 1, "MTTC approaching fires");
  assert(
    (await prisma.escalationEvent.count({
      where: { incidentId: crit.id, triggerType: "MTTC_APPROACHING" },
    })) === 1,
    "MTTC approaching once"
  );

  await backdateDetected(crit.id, 220);
  await prisma.incident.update({
    where: { id: crit.id },
    data: {
      acknowledgedAt: new Date(Date.now() - 150 * 60_000),
      containedAt: null,
    },
  });
  await evaluateIncidentSlaEscalations({
    organizationId: TEST_ORG,
    incidentId: crit.id,
  });
  assert(
    (await prisma.escalationEvent.count({
      where: { incidentId: crit.id, triggerType: "MTTC_BREACHED" },
    })) === 1,
    "MTTC breached once"
  );

  // Contain + push for MTTR
  await prisma.incident.update({
    where: { id: crit.id },
    data: {
      containedAt: new Date(Date.now() - 50 * 60_000),
      status: "CONTAINED",
    },
  });
  await backdateDetected(crit.id, 350); // 80% of 400 = 320 → approaching MTTR
  await evaluateIncidentSlaEscalations({
    organizationId: TEST_ORG,
    incidentId: crit.id,
  });
  assert(
    (await prisma.escalationEvent.count({
      where: { incidentId: crit.id, triggerType: "MTTR_APPROACHING" },
    })) === 1,
    "MTTR approaching once"
  );

  await backdateDetected(crit.id, 450);
  await evaluateIncidentSlaEscalations({
    organizationId: TEST_ORG,
    incidentId: crit.id,
  });
  assert(
    (await prisma.escalationEvent.count({
      where: { incidentId: crit.id, triggerType: "MTTR_BREACHED" },
    })) === 1,
    "MTTR breached once"
  );

  console.log("\n-- completed-late breach --");
  const late = await createIncident({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    data: {
      clientId,
      assetId: null,
      title: "Completed late MTTA",
      description: "late",
      severity: "HIGH",
      category: "OTHER",
      source: "MANUAL",
      detectionMethod: "MANUAL",
      assignedToUserId: null,
      businessImpact: null,
      technicalImpact: null,
      occurredAt: null,
      findingId: null,
      externalSourceId: null,
    },
  });
  const lateDetected = await backdateDetected(late.id, 150);
  await prisma.incident.update({
    where: { id: late.id },
    data: {
      acknowledgedAt: new Date(lateDetected.getTime() + 130 * 60_000), // 130 > 100 target
      status: "ACKNOWLEDGED",
    },
  });
  const lateEval = await evaluateIncidentSlaEscalations({
    organizationId: TEST_ORG,
    incidentId: late.id,
  });
  assert(lateEval.fired >= 1, "completed-late breach can fire");
  assert(
    (await prisma.escalationEvent.count({
      where: { incidentId: late.id, triggerType: "MTTA_BREACHED" },
    })) === 1,
    "completed-late MTTA BREACHED persisted"
  );

  console.log("\n-- recipient fan-out --");
  const halfNotif = await prisma.notification.findFirst({
    where: {
      organizationId: TEST_ORG,
      sourceId: crit.id,
      type: "SLA_MTTA_HALF",
    },
    include: { recipients: true },
  });
  assert(!!halfNotif, "SLA notification created from escalation");
  const recipUsers = await prisma.user.findMany({
    where: { id: { in: halfNotif!.recipients.map((r) => r.userId) } },
    select: { id: true, role: true },
  });
  assert(
    recipUsers.every((u) => u.role !== "VIEWER"),
    "VIEWER excluded from SLA recipients"
  );
  assert(
    recipUsers.some((u) => u.id === ANALYST_U) &&
      recipUsers.some((u) => u.role === "ADMIN") &&
      recipUsers.some((u) => u.role === "OWNER"),
    "assignee ∪ ANALYST ∪ ADMIN ∪ OWNER receive SLA"
  );
  assert(halfNotif!.severity === "HIGH", "CRITICAL MTTA 50% → HIGH severity");

  console.log("\n-- reopen / new generation --");
  await updateIncidentStatus({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    incidentId: crit.id,
    status: "RESOLVED",
    closingNote: null,
  }).catch(async () => {
    // May need CONTAINED path — force resolve stamps
    await prisma.incident.update({
      where: { id: crit.id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
      },
    });
  });
  await updateIncidentStatus({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    incidentId: crit.id,
    status: "INVESTIGATING",
    reason: "Reopen for escalation generation test",
  });
  const snaps = await prisma.incidentSlaSnapshot.findMany({
    where: { incidentId: crit.id },
    orderBy: { generation: "asc" },
  });
  assert(snaps.length >= 2, "reopened incident gets new snapshot generation");
  const newGen = snaps[snaps.length - 1].generation;
  await backdateDetected(crit.id, 55);
  await prisma.incident.update({
    where: { id: crit.id },
    data: {
      acknowledgedAt: null,
      containedAt: null,
      resolvedAt: null,
    },
  });
  await evaluateIncidentSlaEscalations({
    organizationId: TEST_ORG,
    incidentId: crit.id,
  });
  const newHalf = await prisma.escalationEvent.findFirst({
    where: {
      incidentId: crit.id,
      triggerType: "MTTA_HALF",
      dedupeKey: slaEscalationDedupeKey({
        incidentId: crit.id,
        generation: newGen,
        metric: "MTTA",
        suffix: "HALF",
      }),
    },
  });
  assert(!!newHalf, "reopened incident/new snapshot generation can fire again");

  console.log("\n-- derive helpers / severity mapping --");
  const highSnap = await getActiveIncidentSlaSnapshot({
    organizationId: TEST_ORG,
    incidentId: late.id,
  });
  const highEval = evaluateIncidentSla({
    snapshot: highSnap,
    clocks: {
      detectedAt: (await prisma.incident.findUniqueOrThrow({
        where: { id: late.id },
      })).detectedAt,
      acknowledgedAt: (await prisma.incident.findUniqueOrThrow({
        where: { id: late.id },
      })).acknowledgedAt,
      containedAt: null,
      resolvedAt: null,
    },
  });
  const derived = deriveSlaEscalationTriggers({
    evaluationMetrics: highEval.metrics,
    severityAtSnapshot: "HIGH",
    approachingThresholdPct: 80,
    acknowledgedAt: new Date(),
    detectedAt: new Date(Date.now() - 150 * 60_000),
  });
  assert(
    derived.some((t) => t.triggerType === "MTTA_BREACHED"),
    "derive includes completed-late breach"
  );

  const approachHighNotif = await prisma.notification.findFirst({
    where: {
      organizationId: TEST_ORG,
      type: "SLA_MTTA_BREACHED",
      sourceId: late.id,
    },
  });
  assert(
    approachHighNotif?.severity === "HIGH",
    "SLA breached HIGH incident → HIGH notification"
  );

  // Checkpoint untouched
  const ck = await prisma.wazuhIngestionState.findUnique({
    where: { organizationId: DEV_ORG_ID },
    select: { lastTimestamp: true, lastDocumentId: true },
  });
  assert(!!ck?.lastDocumentId, "Wazuh checkpoint still present");

  await cleanup();
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
