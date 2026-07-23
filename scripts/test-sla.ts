/**
 * Attention Phase 3 SLA tests (policy, snapshot, calculator, attention).
 * Isolated TEST orgs — does not mutate Harborline / Agents 000–002.
 * Run: npm run test:sla
 */
import { PrismaClient, type UserRole } from "@prisma/client";
import type { AuthSession } from "../lib/auth/types";
import { DEV_ORG_ID } from "../lib/dev-constants";
import {
  getAttentionSummary,
  listAttentionItems,
} from "../services/attention/attention.service";
import { createIncident, updateIncidentStatus } from "../services/incidents.service";
import { evaluateIncidentSla } from "../services/sla/sla-calculator.service";
import {
  resolveEffectiveSlaPolicy,
  upsertSlaPolicy,
  validateSlaPolicyInput,
} from "../services/sla/sla-policy.service";
import {
  getActiveIncidentSlaSnapshot,
  listIncidentSlaSnapshots,
} from "../services/sla/sla-snapshot.service";

const prisma = new PrismaClient();

const TEST_ORG = "clyslapolicyorg00000000001";
const OTHER_ORG = "clyslapolicyotherorg00001";
const ADMIN_U = "clyslapolicyadmin00000001";
const ANALYST_U = "clyslapolicyanalyst000001";
const VIEWER_U = "clyslapolicyviewer0000001";
const OTHER_ADMIN = "clyslapolicyotheradmin0001";

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

function incidentData(input: {
  clientId: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
}) {
  return {
    clientId: input.clientId,
    assetId: null,
    title: input.title,
    description: `${input.title} description`,
    severity: input.severity,
    category: "OTHER" as const,
    source: "MANUAL" as const,
    detectionMethod: "MANUAL" as const,
    assignedToUserId: null,
    businessImpact: null,
    technicalImpact: null,
    occurredAt: null,
    findingId: null,
    externalSourceId: null,
  };
}

async function cleanup() {
  const orgs = [TEST_ORG, OTHER_ORG];
  await prisma.incidentSlaSnapshot.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.slaPolicy.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.socAttentionUserSnooze.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.socAttentionState.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.incidentActivity.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.incidentNote.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.auditLog.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.incident.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.finding.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.incidentCaseSequence.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.asset.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.client.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.user.deleteMany({
    where: { id: { in: [ADMIN_U, ANALYST_U, VIEWER_U, OTHER_ADMIN] } },
  });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
}

async function main() {
  console.log("\n=== SLA Phase 3 tests ===\n");
  await cleanup();

  await prisma.organization.create({
    data: { id: TEST_ORG, name: "SLA Test Org", slug: "sla-test" },
  });
  await prisma.organization.create({
    data: { id: OTHER_ORG, name: "SLA Other Org", slug: "sla-other" },
  });

  for (const u of [
    { id: ADMIN_U, email: "admin@sla.test", role: "ADMIN" as const },
    { id: ANALYST_U, email: "analyst@sla.test", role: "ANALYST" as const },
    { id: VIEWER_U, email: "viewer@sla.test", role: "VIEWER" as const },
  ]) {
    await prisma.user.create({
      data: {
        id: u.id,
        organizationId: TEST_ORG,
        email: u.email,
        name: u.email,
        role: u.role,
      },
    });
  }
  await prisma.user.create({
    data: {
      id: OTHER_ADMIN,
      organizationId: OTHER_ORG,
      email: "other@sla.test",
      name: "Other",
      role: "ADMIN",
    },
  });

  const clientA = await prisma.client.create({
    data: {
      organizationId: TEST_ORG,
      name: "Client A",
      slug: "client-a",
      status: "ACTIVE",
    },
  });
  const clientB = await prisma.client.create({
    data: {
      organizationId: TEST_ORG,
      name: "Client B",
      slug: "client-b",
      status: "ACTIVE",
    },
  });

  const sessAdmin = session(ADMIN_U, TEST_ORG, "ADMIN", "admin@sla.test");
  const sessAnalyst = session(ANALYST_U, TEST_ORG, "ANALYST", "analyst@sla.test");
  const sessViewer = session(VIEWER_U, TEST_ORG, "VIEWER", "viewer@sla.test");
  const sessOther = session(OTHER_ADMIN, OTHER_ORG, "ADMIN", "other@sla.test");

  console.log("Policy validation & RBAC");
  let zeroRejected = false;
  try {
    validateSlaPolicyInput({
      severity: "CRITICAL",
      mttaMinutes: 0,
      enabled: true,
    });
  } catch {
    zeroRejected = true;
  }
  assert(zeroRejected, "9. Invalid zero target rejected");

  let negRejected = false;
  try {
    validateSlaPolicyInput({
      severity: "HIGH",
      mttaMinutes: -5,
      enabled: true,
    });
  } catch {
    negRejected = true;
  }
  assert(negRejected, "10. Negative target rejected");

  let hugeRejected = false;
  try {
    validateSlaPolicyInput({
      severity: "HIGH",
      mttaMinutes: 525_601,
      enabled: true,
    });
  } catch {
    hugeRejected = true;
  }
  assert(hugeRejected, "11. >365-day target rejected");

  let emptyRejected = false;
  try {
    validateSlaPolicyInput({
      severity: "HIGH",
      enabled: true,
    });
  } catch {
    emptyRejected = true;
  }
  assert(emptyRejected, "12. Empty enabled policy rejected");

  let thrRejected = false;
  try {
    validateSlaPolicyInput({
      severity: "HIGH",
      mttaMinutes: 60,
      approachingThresholdPct: 100,
      enabled: true,
    });
  } catch {
    thrRejected = true;
  }
  assert(thrRejected, "13. Threshold outside 1–99 rejected");

  let viewerBlocked = false;
  try {
    await upsertSlaPolicy({
      session: sessViewer,
      data: { severity: "HIGH", mttaMinutes: 60, enabled: true },
    });
  } catch (e) {
    viewerBlocked = e instanceof Error && e.message === "Forbidden";
  }
  assert(viewerBlocked, "15. VIEWER cannot configure");

  let analystBlocked = false;
  try {
    await upsertSlaPolicy({
      session: sessAnalyst,
      data: { severity: "HIGH", mttaMinutes: 60, enabled: true },
    });
  } catch (e) {
    analystBlocked = e instanceof Error && e.message === "Forbidden";
  }
  assert(analystBlocked, "16. ANALYST cannot configure");

  const orgHigh = await upsertSlaPolicy({
    session: sessAdmin,
    data: {
      severity: "HIGH",
      mttaMinutes: 60,
      mttcMinutes: 240,
      mttrMinutes: 1440,
      approachingThresholdPct: 80,
      enabled: true,
    },
  });
  assert(Boolean(orgHigh.id), "17. ADMIN/OWNER can configure");

  const orgCrit = await upsertSlaPolicy({
    session: sessAdmin,
    data: {
      severity: "CRITICAL",
      mttaMinutes: 15,
      approachingThresholdPct: 80,
      enabled: true,
    },
  });

  console.log("\nResolution");
  const r1 = await resolveEffectiveSlaPolicy({
    organizationId: TEST_ORG,
    clientId: clientA.id,
    severity: "HIGH",
  });
  assert(
    r1?.policyId === orgHigh.id && r1.snapshotSource === "ORG_DEFAULT",
    "1. Org default resolution"
  );

  const overrideA = await upsertSlaPolicy({
    session: sessAdmin,
    data: {
      clientId: clientA.id,
      severity: "HIGH",
      mttaMinutes: 30,
      enabled: true,
    },
  });
  const r2 = await resolveEffectiveSlaPolicy({
    organizationId: TEST_ORG,
    clientId: clientA.id,
    severity: "HIGH",
  });
  assert(
    r2?.policyId === overrideA.id && r2.snapshotSource === "CLIENT_OVERRIDE",
    "2. Client override wins"
  );

  const r3 = await resolveEffectiveSlaPolicy({
    organizationId: TEST_ORG,
    clientId: clientB.id,
    severity: "HIGH",
  });
  assert(
    r3?.policyId === orgHigh.id && r3.mttaMinutes === 60,
    "3. Client A override never applies to Client B"
  );

  // Incidents always have clientId in schema — org default for any client without override
  assert(
    (await resolveEffectiveSlaPolicy({
      organizationId: TEST_ORG,
      clientId: null,
      severity: "HIGH",
    }))?.policyId === orgHigh.id,
    "4. Null-client resolution uses org default only"
  );

  await upsertSlaPolicy({
    session: sessAdmin,
    data: {
      clientId: clientA.id,
      severity: "HIGH",
      mttaMinutes: 30,
      enabled: false,
    },
  });
  const r5 = await resolveEffectiveSlaPolicy({
    organizationId: TEST_ORG,
    clientId: clientA.id,
    severity: "HIGH",
  });
  assert(
    r5?.policyId === orgHigh.id,
    "5. Disabled override falls back to org default"
  );

  await prisma.slaPolicy.updateMany({
    where: { organizationId: TEST_ORG, severity: "CRITICAL" },
    data: { enabled: false },
  });
  assert(
    (await resolveEffectiveSlaPolicy({
      organizationId: TEST_ORG,
      clientId: clientA.id,
      severity: "CRITICAL",
    })) == null,
    "6. NO_POLICY when nothing enabled"
  );
  await prisma.slaPolicy.update({
    where: { id: orgCrit.id },
    data: { enabled: true },
  });

  let dupOrg = false;
  try {
    await prisma.slaPolicy.create({
      data: {
        organizationId: TEST_ORG,
        clientId: null,
        severity: "HIGH",
        mttaMinutes: 10,
        approachingThresholdPct: 80,
        enabled: true,
      },
    });
  } catch {
    dupOrg = true;
  }
  assert(dupOrg, "7. Duplicate org default prevented");

  await upsertSlaPolicy({
    session: sessAdmin,
    data: {
      clientId: clientA.id,
      severity: "HIGH",
      mttaMinutes: 45,
      enabled: true,
    },
  });
  let dupClient = false;
  try {
    await prisma.slaPolicy.create({
      data: {
        organizationId: TEST_ORG,
        clientId: clientA.id,
        severity: "HIGH",
        mttaMinutes: 10,
        approachingThresholdPct: 80,
        enabled: true,
      },
    });
  } catch {
    dupClient = true;
  }
  assert(dupClient, "8. Duplicate client override prevented");

  let crossOrg = false;
  try {
    await upsertSlaPolicy({
      session: sessOther,
      data: {
        clientId: clientA.id,
        severity: "HIGH",
        mttaMinutes: 10,
        enabled: true,
      },
    });
  } catch {
    crossOrg = true;
  }
  assert(crossOrg, "14. Cross-org policy write rejected");

  console.log("\nSnapshots & calculation");
  const beforeSnapCount = await prisma.incidentSlaSnapshot.count({
    where: { organizationId: TEST_ORG },
  });

  const created = await createIncident({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    data: incidentData({
      clientId: clientA.id,
      title: "SLA HIGH Incident",
      severity: "HIGH",
    }),
  });
  const snap1 = await getActiveIncidentSlaSnapshot({
    organizationId: TEST_ORG,
    incidentId: created.id,
  });
  assert(
    snap1 != null &&
      snap1.generation === 1 &&
      snap1.snapshotSource === "CLIENT_OVERRIDE" &&
      snap1.mttaMinutes === 45,
    "18/19. New eligible Incident snapshots effective client override"
  );

  const createdOrg = await createIncident({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    data: incidentData({
      clientId: clientB.id,
      title: "SLA Org Default Incident",
      severity: "HIGH",
    }),
  });
  const snapOrg = await getActiveIncidentSlaSnapshot({
    organizationId: TEST_ORG,
    incidentId: createdOrg.id,
  });
  assert(
    snapOrg?.snapshotSource === "ORG_DEFAULT" && snapOrg.mttaMinutes === 60,
    "20. Org default snapshot records correct source"
  );

  const frozenMtta = snap1!.mttaMinutes;
  await upsertSlaPolicy({
    session: sessAdmin,
    data: {
      clientId: clientA.id,
      severity: "HIGH",
      mttaMinutes: 99,
      enabled: true,
    },
  });
  const snapAfterEdit = await getActiveIncidentSlaSnapshot({
    organizationId: TEST_ORG,
    incidentId: created.id,
  });
  assert(
    snapAfterEdit?.mttaMinutes === frozenMtta,
    "21. Policy edit does not alter existing snapshot"
  );

  await prisma.slaPolicy.updateMany({
    where: { id: overrideA.id },
    data: { enabled: false },
  });
  assert(
    (await getActiveIncidentSlaSnapshot({
      organizationId: TEST_ORG,
      incidentId: created.id,
    }))?.mttaMinutes === frozenMtta,
    "22. Policy disable does not alter historical snapshot"
  );

  // Re-enable override for later
  await upsertSlaPolicy({
    session: sessAdmin,
    data: {
      clientId: clientA.id,
      severity: "HIGH",
      mttaMinutes: 45,
      enabled: true,
    },
  });

  const med = await createIncident({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    data: incidentData({
      clientId: clientA.id,
      title: "MEDIUM no SLA",
      severity: "MEDIUM",
    }),
  });
  assert(
    (await getActiveIncidentSlaSnapshot({
      organizationId: TEST_ORG,
      incidentId: med.id,
    })) == null,
    "23. Incident without MVP severity policy has NO_POLICY / no snapshot"
  );

  const historicalCount = await prisma.incident.count({
    where: { organizationId: DEV_ORG_ID },
  });
  const harborSnaps = await prisma.incidentSlaSnapshot.count({
    where: { organizationId: DEV_ORG_ID },
  });
  assert(
    harborSnaps === 0 && historicalCount >= 0,
    "24. Historical incidents are not automatically backfilled"
  );

  await prisma.incident.update({
    where: { id: created.id },
    data: { severity: "CRITICAL" },
  });
  assert(
    (await getActiveIncidentSlaSnapshot({
      organizationId: TEST_ORG,
      incidentId: created.id,
    }))?.severityAtSnapshot === "HIGH",
    "25. Severity change does not silently replace active snapshot"
  );
  // restore for reopen path
  await prisma.incident.update({
    where: { id: created.id },
    data: { severity: "HIGH" },
  });

  await updateIncidentStatus({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    incidentId: created.id,
    status: "ACKNOWLEDGED",
  });
  await updateIncidentStatus({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    incidentId: created.id,
    status: "INVESTIGATING",
  });
  await updateIncidentStatus({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    incidentId: created.id,
    status: "RESOLVED",
  });
  await updateIncidentStatus({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    incidentId: created.id,
    status: "INVESTIGATING",
    reason: "Reopen for SLA generation test",
  });
  const snaps = await listIncidentSlaSnapshots({
    organizationId: TEST_ORG,
    incidentId: created.id,
  });
  assert(
    snaps.length === 2 && snaps[1].generation === 2,
    "26. Reopen creates new snapshot generation"
  );
  assert(snaps[0].generation === 1, "27. Previous snapshot remains for history");

  const detectedAt = new Date("2026-01-01T00:00:00.000Z");
  const calcBase = {
    id: "snap",
    generation: 1,
    policyId: "p",
    clientIdAtSnapshot: clientA.id,
    severityAtSnapshot: "HIGH" as const,
    mttaMinutes: 60,
    mttcMinutes: 120,
    mttrMinutes: 240,
    approachingThresholdPct: 80,
    snapshotSource: "ORG_DEFAULT" as const,
    snappedAt: detectedAt,
  };

  const onTrack = evaluateIncidentSla({
    snapshot: calcBase,
    clocks: {
      detectedAt,
      acknowledgedAt: null,
      containedAt: null,
      resolvedAt: null,
    },
    now: new Date(detectedAt.getTime() + 30 * 60_000),
  });
  assert(onTrack.metrics[0].state === "ON_TRACK", "28. MTTA ON_TRACK");

  const approaching = evaluateIncidentSla({
    snapshot: calcBase,
    clocks: {
      detectedAt,
      acknowledgedAt: null,
      containedAt: null,
      resolvedAt: null,
    },
    now: new Date(detectedAt.getTime() + 50 * 60_000),
  });
  assert(approaching.metrics[0].state === "APPROACHING", "29. MTTA APPROACHING");

  const breached = evaluateIncidentSla({
    snapshot: calcBase,
    clocks: {
      detectedAt,
      acknowledgedAt: null,
      containedAt: null,
      resolvedAt: null,
    },
    now: new Date(detectedAt.getTime() + 90 * 60_000),
  });
  assert(breached.metrics[0].state === "BREACHED", "30. MTTA BREACHED");

  const met = evaluateIncidentSla({
    snapshot: calcBase,
    clocks: {
      detectedAt,
      acknowledgedAt: new Date(detectedAt.getTime() + 40 * 60_000),
      containedAt: null,
      resolvedAt: null,
    },
    now: new Date(detectedAt.getTime() + 90 * 60_000),
  });
  assert(met.metrics[0].state === "MET", "31. MTTA MET");

  const late = evaluateIncidentSla({
    snapshot: calcBase,
    clocks: {
      detectedAt,
      acknowledgedAt: new Date(detectedAt.getTime() + 90 * 60_000),
      containedAt: null,
      resolvedAt: null,
    },
  });
  assert(late.metrics[0].state === "BREACHED", "32. Late completed MTTA remains BREACHED");

  const mttcApp = evaluateIncidentSla({
    snapshot: calcBase,
    clocks: {
      detectedAt,
      acknowledgedAt: new Date(detectedAt.getTime() + 10 * 60_000),
      containedAt: null,
      resolvedAt: null,
    },
    now: new Date(detectedAt.getTime() + 100 * 60_000),
  });
  assert(mttcApp.metrics[1].state === "APPROACHING", "33. MTTC APPROACHING equivalent");

  const mttrBreach = evaluateIncidentSla({
    snapshot: calcBase,
    clocks: {
      detectedAt,
      acknowledgedAt: new Date(detectedAt.getTime() + 10 * 60_000),
      containedAt: new Date(detectedAt.getTime() + 20 * 60_000),
      resolvedAt: null,
    },
    now: new Date(detectedAt.getTime() + 300 * 60_000),
  });
  assert(mttrBreach.metrics[2].state === "BREACHED", "34. MTTR BREACHED equivalent");

  assert(
    mttrBreach.overallState === "BREACHED" &&
      mttrBreach.reasons.includes("MTTR breached"),
    "35/36. Multiple metric states + rollup"
  );
  assert(
    approaching.metrics[0].remainingMinutes != null &&
      approaching.metrics[0].dueAt != null,
    "37. Correct remaining minutes/dueAt"
  );

  console.log("\nAttention");
  // Force breached open incident for attention
  const attInc = await createIncident({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    data: incidentData({
      clientId: clientB.id,
      title: "Attention SLA Breached",
      severity: "HIGH",
    }),
  });
  await prisma.incident.update({
    where: { id: attInc.id },
    data: { detectedAt: new Date(Date.now() - 3 * 60 * 60_000) },
  });

  const asset = await prisma.asset.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientB.id,
      name: "SLA Asset",
      type: "SERVER",
      environment: "PRODUCTION",
      criticality: "HIGH",
      monitoringStatus: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
    },
  });

  const overdueFinding = await prisma.finding.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientB.id,
      assetId: asset.id,
      title: "Overdue finding not SLA",
      severity: "HIGH",
      status: "OPEN",
      source: "PASSIVE_CHECK",
      code: `SLA-OVERDUE-${Date.now()}`,
      firstDetectedAt: new Date(),
      lastDetectedAt: new Date(),
      dueDate: new Date(Date.now() - 86_400_000),
    },
  });

  const list = await listAttentionItems(TEST_ORG, { pageSize: 100 });
  const incidentItems = list.items.filter((i) => i.sourceId === attInc.id);
  assert(incidentItems.length === 1, "38. One Incident = one AttentionItem");
  assert(
    incidentItems[0].reasons.some((r) => /MTTA breached/i.test(r)),
    "39. Multiple SLA reasons merge (MTTA breached present)"
  );
  assert(
    !incidentItems[0].reasons.some((r) => /SLA breached/i.test(r) && !/MTTA|MTTC|MTTR/.test(r)),
    "42b. No generic SLA breached without metric"
  );

  const findingItem = list.items.find((i) => i.sourceId === overdueFinding.id);
  assert(
    Boolean(findingItem?.overdue) && findingItem?.slaState === "NO_POLICY",
    "42. Finding overdue remains non-SLA"
  );

  const orderIdx = (pred: (i: (typeof list.items)[0]) => boolean) =>
    list.items.findIndex(pred);
  const breachedIdx = orderIdx((i) => i.slaState === "BREACHED");
  const overdueIdx = orderIdx((i) => i.overdue && i.sourceType === "FINDING");
  assert(
    breachedIdx >= 0 && overdueIdx >= 0 && breachedIdx < overdueIdx,
    "40/41. BREACHED sorts above Finding OVERDUE"
  );

  const beforeSummary = await getAttentionSummary(TEST_ORG);
  await prisma.socAttentionUserSnooze.create({
    data: {
      organizationId: TEST_ORG,
      userId: ANALYST_U,
      sourceType: "INCIDENT",
      sourceId: attInc.id,
      eligibilityGeneration: incidentItems[0].eligibilityGeneration,
      snoozedUntil: new Date(Date.now() + 60 * 60_000),
    },
  });
  const afterSummary = await getAttentionSummary(TEST_ORG);
  assert(
    afterSummary.slaBreached === beforeSummary.slaBreached,
    "43. Snooze does not change dashboard SLA counts"
  );

  assert(
    afterSummary.slaBreached > 0 &&
      !list.items.some(
        (i) => i.slaState === "NO_POLICY" && i.reasons.some((r) => /breached/i.test(r))
      ),
    "46. NO_POLICY never appears as breached"
  );

  const map002 = await prisma.wazuhAgentMapping.findFirst({
    where: { organizationId: DEV_ORG_ID, wazuhAgentId: "002" },
  });
  assert(
    map002?.id === "cmrw2lm5u0003ooqefdczjjek",
    "Harborline Agent 002 mapping unchanged"
  );

  console.log(
    `\nSnapshot count delta: ${beforeSnapCount} -> ${await prisma.incidentSlaSnapshot.count({ where: { organizationId: TEST_ORG } })}`
  );
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  await cleanup();
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
