/**
 * Attention Phase 2 state tests (ack / claim / snooze).
 * Isolated TEST orgs — does not mutate Harborline / Agents 000–002.
 * Run: npm run test:attention-state
 */
import { PrismaClient, type UserRole } from "@prisma/client";
import type { AuthSession } from "../lib/auth/types";
import { DEV_ORG_ID } from "../lib/dev-constants";
import {
  listAttentionItems,
  getAttentionSummary,
} from "../services/attention/attention.service";
import {
  AttentionConflictError,
  acknowledgeAttention,
  claimAttention,
  clearAttentionSnooze,
  releaseAttentionClaim,
  resolveSnoozeUntil,
  snoozeAttention,
} from "../services/attention/attention-state.service";

const prisma = new PrismaClient();

const TEST_ORG = "clyattnstateorg00000000001";
const OTHER_ORG = "clyattnstateotherorg000001";
const ANALYST_A = "clyattnstateuserA00000001";
const ANALYST_B = "clyattnstateuserB00000001";
const VIEWER_U = "clyattnstateviewer0000001";
const ADMIN_U = "clyattnstateadmin00000001";
const OTHER_USER = "clyattnstateotheru0000001";

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
  await prisma.socAttentionUserSnooze.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.socAttentionState.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.investigationGroupIncident.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.investigationGroupEvent.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.investigationActivity.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.incidentActivity.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.incidentSecurityEvent.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.auditLog.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.investigationGroup.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.incident.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.finding.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.securityEvent.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.asset.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.client.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.user.deleteMany({
    where: {
      id: { in: [ANALYST_A, ANALYST_B, VIEWER_U, ADMIN_U, OTHER_USER] },
    },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: orgs } },
  });
}

async function main() {
  console.log("\n=== Attention state tests ===\n");
  await cleanup();

  await prisma.organization.create({
    data: { id: TEST_ORG, name: "Attn State Org", slug: "attn-state" },
  });
  await prisma.organization.create({
    data: { id: OTHER_ORG, name: "Attn Other Org", slug: "attn-other" },
  });

  for (const u of [
    { id: ANALYST_A, email: "a@attn.test", role: "ANALYST" as const },
    { id: ANALYST_B, email: "b@attn.test", role: "ANALYST" as const },
    { id: VIEWER_U, email: "v@attn.test", role: "VIEWER" as const },
    { id: ADMIN_U, email: "admin@attn.test", role: "ADMIN" as const },
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
      id: OTHER_USER,
      organizationId: OTHER_ORG,
      email: "other@attn.test",
      name: "Other",
      role: "ANALYST",
    },
  });

  const client = await prisma.client.create({
    data: {
      organizationId: TEST_ORG,
      name: "State Client",
      slug: "state-client",
      status: "ACTIVE",
    },
  });
  const asset = await prisma.asset.create({
    data: {
      organizationId: TEST_ORG,
      clientId: client.id,
      name: "State Asset",
      type: "SERVER",
      environment: "PRODUCTION",
      criticality: "HIGH",
      monitoringStatus: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
    },
  });

  const now = new Date();
  const se = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: client.id,
      assetId: asset.id,
      source: "WAZUH",
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      title: "State SE High",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `attn-state-se-${Date.now()}`,
    },
  });
  const seCrit = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: client.id,
      assetId: asset.id,
      source: "WAZUH",
      severity: "CRITICAL",
      status: "NEW",
      classification: "ACTIONABLE",
      title: "State SE Critical",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `attn-state-se-crit-${Date.now()}`,
    },
  });
  const seOtherOrg = await prisma.securityEvent.create({
    data: {
      organizationId: OTHER_ORG,
      source: "WAZUH",
      severity: "CRITICAL",
      status: "NEW",
      classification: "ACTIONABLE",
      title: "Other org SE",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `attn-state-other-${Date.now()}`,
    },
  });
  const finding = await prisma.finding.create({
    data: {
      organizationId: TEST_ORG,
      clientId: client.id,
      assetId: asset.id,
      title: "State Finding High",
      severity: "HIGH",
      status: "OPEN",
      source: "PASSIVE_CHECK",
      code: `ATTN-STATE-F-${Date.now()}`,
      firstDetectedAt: now,
      lastDetectedAt: now,
    },
  });
  const inv = await prisma.investigationGroup.create({
    data: {
      organizationId: TEST_ORG,
      clientId: client.id,
      assetId: asset.id,
      title: "State Investigation",
      severity: "HIGH",
      status: "OPEN",
      createdByType: "SYSTEM_SUGGESTED",
      groupingExplanation: "test",
    },
  });
  const incident = await prisma.incident.create({
    data: {
      organizationId: TEST_ORG,
      clientId: client.id,
      assetId: asset.id,
      caseNumber: `INC-ATTN-STATE-${Date.now()}`,
      title: "State Incident",
      severity: "HIGH",
      status: "OPEN",
      category: "OTHER",
      source: "MANUAL",
      detectionMethod: "MANUAL",
      detectedAt: now,
      createdByUserId: ANALYST_A,
    },
  });

  const sessA = session(ANALYST_A, TEST_ORG, "ANALYST", "a@attn.test");
  const sessB = session(ANALYST_B, TEST_ORG, "ANALYST", "b@attn.test");
  const sessV = session(VIEWER_U, TEST_ORG, "VIEWER", "v@attn.test");
  const sessAdmin = session(ADMIN_U, TEST_ORG, "ADMIN", "admin@attn.test");
  const sessOther = session(OTHER_USER, OTHER_ORG, "ANALYST", "other@attn.test");

  console.log("Cross-org + VIEWER");
  let crossAck = false;
  try {
    await acknowledgeAttention({
      session: sessOther,
      sourceType: "SECURITY_EVENT",
      sourceId: se.id,
    });
  } catch {
    crossAck = true;
  }
  assert(crossAck, "1. Cross-org acknowledgement rejected");

  let crossClaim = false;
  try {
    await claimAttention({
      session: sessOther,
      sourceType: "SECURITY_EVENT",
      sourceId: se.id,
    });
  } catch {
    crossClaim = true;
  }
  assert(crossClaim, "2. Cross-org claim rejected");

  let crossSnooze = false;
  try {
    await snoozeAttention({
      session: sessOther,
      sourceType: "SECURITY_EVENT",
      sourceId: se.id,
      preset: "MINUTES_15",
    });
  } catch {
    crossSnooze = true;
  }
  assert(crossSnooze, "3. Cross-org snooze rejected");

  let viewerAck = false;
  try {
    await acknowledgeAttention({
      session: sessV,
      sourceType: "SECURITY_EVENT",
      sourceId: se.id,
    });
  } catch (e) {
    viewerAck = e instanceof Error && e.message === "Forbidden";
  }
  assert(viewerAck, "4. VIEWER cannot acknowledge");

  let viewerClaim = false;
  try {
    await claimAttention({
      session: sessV,
      sourceType: "SECURITY_EVENT",
      sourceId: se.id,
    });
  } catch (e) {
    viewerClaim = e instanceof Error && e.message === "Forbidden";
  }
  assert(viewerClaim, "5. VIEWER cannot claim");

  let viewerSnooze = false;
  try {
    await snoozeAttention({
      session: sessV,
      sourceType: "SECURITY_EVENT",
      sourceId: se.id,
      preset: "MINUTES_15",
    });
  } catch (e) {
    viewerSnooze = e instanceof Error && e.message === "Forbidden";
  }
  assert(viewerSnooze, "6. VIEWER cannot snooze");

  console.log("\nShared acknowledgement");
  const ack1 = await acknowledgeAttention({
    session: sessA,
    sourceType: "SECURITY_EVENT",
    sourceId: se.id,
  });
  assert(Boolean(ack1.acknowledgedAt), "7. ANALYST shared acknowledgement succeeds");

  const listB = await listAttentionItems(
    TEST_ORG,
    { pageSize: 100 },
    { viewerUserId: ANALYST_B }
  );
  const seItemB = listB.items.find((i) => i.sourceId === se.id);
  assert(
    Boolean(seItemB?.acknowledged && seItemB.acknowledgedByUserId === ANALYST_A),
    "8. Shared acknowledgement visible to another analyst"
  );

  const ack2 = await acknowledgeAttention({
    session: sessB,
    sourceType: "SECURITY_EVENT",
    sourceId: se.id,
  });
  assert(
    ack2.acknowledgedByUserId === ANALYST_A &&
      ack2.acknowledgedAt.getTime() === ack1.acknowledgedAt.getTime(),
    "9. Duplicate acknowledgement is idempotent"
  );

  const seRow = await prisma.securityEvent.findUnique({ where: { id: se.id } });
  assert(
    seRow?.status === "NEW" && seRow.acknowledgedAt == null,
    "10. Acknowledgement does not mutate underlying source"
  );

  console.log("\nClaims");
  await claimAttention({
    session: sessA,
    sourceType: "SECURITY_EVENT",
    sourceId: se.id,
  });
  const afterSeClaim = await listAttentionItems(
    TEST_ORG,
    { pageSize: 100 },
    { viewerUserId: ANALYST_A }
  );
  assert(
    afterSeClaim.items.find((i) => i.sourceId === se.id)?.ownerUserId ===
      ANALYST_A,
    "11. SE overlay claim works"
  );

  await claimAttention({
    session: sessA,
    sourceType: "INVESTIGATION",
    sourceId: inv.id,
  });
  const afterInvClaim = await listAttentionItems(
    TEST_ORG,
    { pageSize: 100 },
    { viewerUserId: ANALYST_A }
  );
  assert(
    afterInvClaim.items.find((i) => i.sourceId === inv.id)?.ownerUserId ===
      ANALYST_A,
    "12. Investigation overlay claim works"
  );

  // Concurrent claim on seCrit
  const results = await Promise.allSettled([
    claimAttention({
      session: sessA,
      sourceType: "SECURITY_EVENT",
      sourceId: seCrit.id,
    }),
    claimAttention({
      session: sessB,
      sourceType: "SECURITY_EVENT",
      sourceId: seCrit.id,
    }),
  ]);
  const wins = results.filter((r) => r.status === "fulfilled").length;
  const conflicts = results.filter(
    (r) =>
      r.status === "rejected" &&
      r.reason instanceof AttentionConflictError
  ).length;
  assert(wins === 1 && conflicts === 1, "13. Concurrent overlay claim allows only one winner");

  await releaseAttentionClaim({
    session: sessA,
    sourceType: "SECURITY_EVENT",
    sourceId: se.id,
  });
  const afterRelease = await listAttentionItems(
    TEST_ORG,
    { pageSize: 100 },
    { viewerUserId: ANALYST_A }
  );
  assert(
    !afterRelease.items.find((i) => i.sourceId === se.id)?.isClaimed,
    "14. Analyst releases own claim"
  );

  // Re-claim as A, B cannot release
  await claimAttention({
    session: sessA,
    sourceType: "SECURITY_EVENT",
    sourceId: se.id,
  });
  let bReleaseBlocked = false;
  try {
    await releaseAttentionClaim({
      session: sessB,
      sourceType: "SECURITY_EVENT",
      sourceId: se.id,
    });
  } catch (e) {
    bReleaseBlocked = e instanceof Error && e.message === "Forbidden";
  }
  assert(bReleaseBlocked, "15. Analyst cannot release another analyst's claim");

  await releaseAttentionClaim({
    session: sessAdmin,
    sourceType: "SECURITY_EVENT",
    sourceId: se.id,
  });
  const afterAdminRelease = await listAttentionItems(
    TEST_ORG,
    { pageSize: 100 },
    { viewerUserId: ANALYST_A }
  );
  assert(
    !afterAdminRelease.items.find((i) => i.sourceId === se.id)?.isClaimed,
    "16. ADMIN/OWNER can override/reassign (release)"
  );

  await claimAttention({
    session: sessA,
    sourceType: "INCIDENT",
    sourceId: incident.id,
  });
  const incRow = await prisma.incident.findUnique({ where: { id: incident.id } });
  assert(incRow?.assignedToUserId === ANALYST_A, "17. Incident claim delegates to Incident assignment");

  await claimAttention({
    session: sessA,
    sourceType: "FINDING",
    sourceId: finding.id,
  });
  const fRow = await prisma.finding.findUnique({ where: { id: finding.id } });
  assert(fRow?.assignedToUserId === ANALYST_A, "18. Finding claim delegates to Finding assignment");

  const overlayForFinding = await prisma.socAttentionState.findFirst({
    where: {
      organizationId: TEST_ORG,
      sourceType: "FINDING",
      sourceId: finding.id,
      claimedByUserId: { not: null },
    },
  });
  assert(
    overlayForFinding == null,
    "19. No duplicate authoritative assignment state for Finding"
  );

  console.log("\nSnooze");
  const beforeSummary = await getAttentionSummary(TEST_ORG);
  await snoozeAttention({
    session: sessA,
    sourceType: "SECURITY_EVENT",
    sourceId: se.id,
    preset: "HOURS_4",
  });
  const listASnoozed = await listAttentionItems(
    TEST_ORG,
    { snooze: "ACTIVE", pageSize: 100 },
    { viewerUserId: ANALYST_A }
  );
  assert(
    !listASnoozed.items.some((i) => i.sourceId === se.id),
    "20. Personal snooze hides only for snoozing analyst"
  );
  const listBSees = await listAttentionItems(
    TEST_ORG,
    { snooze: "ACTIVE", pageSize: 100 },
    { viewerUserId: ANALYST_B }
  );
  assert(
    listBSees.items.some((i) => i.sourceId === se.id),
    "21. Other analyst still sees snoozed item"
  );
  const afterSummary = await getAttentionSummary(TEST_ORG);
  assert(
    afterSummary.total === beforeSummary.total &&
      afterSummary.critical === beforeSummary.critical,
    "22. Dashboard count unchanged by personal snooze"
  );

  // Force expiry
  await prisma.socAttentionUserSnooze.updateMany({
    where: {
      organizationId: TEST_ORG,
      userId: ANALYST_A,
      sourceId: se.id,
    },
    data: { snoozedUntil: new Date(Date.now() - 1000) },
  });
  const afterExpiry = await listAttentionItems(
    TEST_ORG,
    { snooze: "ACTIVE", pageSize: 100 },
    { viewerUserId: ANALYST_A }
  );
  assert(
    afterExpiry.items.some((i) => i.sourceId === se.id),
    "23. Snooze expiry restores item"
  );

  await snoozeAttention({
    session: sessA,
    sourceType: "SECURITY_EVENT",
    sourceId: se.id,
    preset: "MINUTES_15",
  });
  await clearAttentionSnooze({
    session: sessA,
    sourceType: "SECURITY_EVENT",
    sourceId: se.id,
  });
  const afterClear = await listAttentionItems(
    TEST_ORG,
    { snooze: "ACTIVE", pageSize: 100 },
    { viewerUserId: ANALYST_A }
  );
  assert(
    afterClear.items.some((i) => i.sourceId === se.id),
    "24. Clear snooze restores item"
  );

  let longSnooze = false;
  try {
    resolveSnoozeUntil("CUSTOM", new Date(Date.now() + 8 * 24 * 60 * 60 * 1000));
  } catch {
    longSnooze = true;
  }
  assert(longSnooze, "25. Custom snooze >7 days rejected");

  let pastSnooze = false;
  try {
    resolveSnoozeUntil("CUSTOM", new Date(Date.now() - 60_000));
  } catch {
    pastSnooze = true;
  }
  assert(pastSnooze, "26. Past snooze rejected");

  console.log("\nEligibility / isolation");
  await prisma.securityEvent.update({
    where: { id: se.id },
    data: { status: "DISMISSED", dismissedAt: new Date() },
  });
  const afterDismiss = await listAttentionItems(TEST_ORG, { pageSize: 100 });
  assert(
    !afterDismiss.items.some((i) => i.sourceId === se.id),
    "27. Source resolution causes automatic queue exit"
  );

  let resurrect = false;
  try {
    await acknowledgeAttention({
      session: sessA,
      sourceType: "SECURITY_EVENT",
      sourceId: se.id,
    });
  } catch (e) {
    resurrect =
      e instanceof Error &&
      e.message.includes("not eligible");
  }
  assert(resurrect, "28. Overlay cannot resurrect ineligible source");

  // Stale generation: insert overlay with wrong generation for seCrit
  await prisma.socAttentionState.create({
    data: {
      organizationId: TEST_ORG,
      sourceType: "SECURITY_EVENT",
      sourceId: seCrit.id,
      eligibilityGeneration: "stale-generation-xyz",
      acknowledgedAt: new Date(),
      acknowledgedByUserId: ANALYST_A,
    },
  });
  const critItem = (
    await listAttentionItems(
      TEST_ORG,
      { pageSize: 100 },
      { viewerUserId: ANALYST_B }
    )
  ).items.find((i) => i.sourceId === seCrit.id);
  assert(
    critItem != null && critItem.acknowledged === false,
    "29. Stale generation overlay ignored"
  );

  const clientFiltered = await listAttentionItems(TEST_ORG, {
    clientId: client.id,
    pageSize: 100,
  });
  assert(
    clientFiltered.items.every((i) => i.clientId === client.id),
    "30. Client isolation from Phase 1 remains intact"
  );

  const seNull = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: null,
      source: "WAZUH",
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      title: "Unattributed state SE",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `attn-state-null-${Date.now()}`,
    },
  });
  const unattr = await listAttentionItems(TEST_ORG, {
    attribution: "UNATTRIBUTED",
    pageSize: 100,
  });
  assert(
    unattr.items.some(
      (i) => i.sourceId === seNull.id && i.isUnattributed
    ),
    "31. Null/unattributed handling remains intact"
  );

  // Other org SE never listed
  assert(
    !(await listAttentionItems(TEST_ORG, { pageSize: 100 })).items.some(
      (i) => i.sourceId === seOtherOrg.id
    ),
    "31b. Cross-org source never listed"
  );

  const harborlineMap = await prisma.wazuhAgentMapping.findFirst({
    where: { organizationId: DEV_ORG_ID, wazuhAgentId: "002" },
  });
  assert(
    harborlineMap?.id === "cmrw2lm5u0003ooqefdczjjek",
    "Harborline Agent 002 mapping unchanged"
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
