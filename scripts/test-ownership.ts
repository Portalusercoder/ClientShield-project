/**
 * Phase 6b3 — Ownership ACK / CLAIM / ASSIGN consistency tests.
 * Run: npm run test:ownership
 */
import { PrismaClient, type UserRole } from "@prisma/client";
import type { AuthSession } from "../lib/auth/types";
import {
  attentionOwnershipMode,
  ATTENTION_QUEUE_RULES,
  OWNERSHIP_TERMS,
} from "../lib/ownership/model";
import { listAttentionItems } from "../services/attention/attention.service";
import {
  AttentionConflictError,
  acknowledgeAttention,
  claimAttention,
  getAttentionOwnershipSnapshot,
  releaseAttentionClaim,
} from "../services/attention/attention-state.service";
import { assignInvestigation } from "../services/investigations/investigation-lifecycle.service";

const prisma = new PrismaClient();

const TEST_ORG = "clyownorg00000000000000001";
const OTHER_ORG = "clyownotherorg00000000001";
const ANALYST_A = "clyownuserA00000000000001";
const ANALYST_B = "clyownuserB00000000000001";
const DISABLED_U = "clyowndisabled000000000001";
const OTHER_U = "clyownotheru0000000000001";

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
  role: UserRole = "ANALYST"
): AuthSession {
  return {
    userId,
    organizationId,
    email: `${userId}@test.local`,
    name: userId,
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
  await prisma.investigationActivity.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.investigationNote.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.investigationGroupEvent.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.securityEventActivity.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.auditLog.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.investigationGroup.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.securityEvent.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [ANALYST_A, ANALYST_B, DISABLED_U, OTHER_U] } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: orgs } },
  });
}

async function main() {
  console.log("\n=== Ownership consistency (Phase 6b3) ===\n");
  await cleanup();

  assert(
    OWNERSHIP_TERMS.claimedBy === "Claimed by" &&
      OWNERSHIP_TERMS.assignedTo === "Assigned to",
    "Canonical vocabulary present"
  );
  assert(
    attentionOwnershipMode("SECURITY_EVENT") === "CLAIM_OVERLAY",
    "SE uses claim overlay"
  );
  assert(
    attentionOwnershipMode("INVESTIGATION") === "CLAIM_OVERLAY",
    "Inv uses claim overlay"
  );
  assert(
    attentionOwnershipMode("FINDING") === "NATIVE_ASSIGN",
    "Finding uses native assign"
  );
  assert(
    attentionOwnershipMode("INCIDENT") === "NATIVE_ASSIGN",
    "Incident uses native assign"
  );
  assert(
    ATTENTION_QUEUE_RULES.acknowledgementRemovesFromQueue === false,
    "Ack does not remove from queue"
  );

  await prisma.organization.create({
    data: { id: TEST_ORG, name: "Own Org", slug: "own-org-6b3" },
  });
  await prisma.organization.create({
    data: { id: OTHER_ORG, name: "Own Other", slug: "own-other-6b3" },
  });
  for (const [id, org, disabled] of [
    [ANALYST_A, TEST_ORG, null],
    [ANALYST_B, TEST_ORG, null],
    [DISABLED_U, TEST_ORG, new Date()],
    [OTHER_U, OTHER_ORG, null],
  ] as const) {
    await prisma.user.create({
      data: {
        id,
        organizationId: org,
        email: `${id}@test.local`,
        name: id,
        role: "ANALYST",
        disabledAt: disabled,
      },
    });
  }

  const now = new Date();
  const se = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      title: "Own SE",
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      source: "WAZUH",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `own-se-${now.getTime()}`,
    },
  });
  const inv = await prisma.investigationGroup.create({
    data: {
      organizationId: TEST_ORG,
      title: "Own Inv",
      status: "OPEN",
      severity: "HIGH",
      createdByType: "ANALYST_CREATED",
      createdByUserId: ANALYST_A,
    },
  });

  const sessA = session(ANALYST_A, TEST_ORG);
  const sessB = session(ANALYST_B, TEST_ORG);

  // Ack does not claim or assign
  await acknowledgeAttention({
    session: sessA,
    sourceType: "SECURITY_EVENT",
    sourceId: se.id,
  });
  const afterAck = await getAttentionOwnershipSnapshot({
    organizationId: TEST_ORG,
    sourceType: "SECURITY_EVENT",
    sourceId: se.id,
  });
  assert(Boolean(afterAck.acknowledgedAt), "Ack sets acknowledgedAt");
  assert(afterAck.claimedByUserId == null, "Ack does not claim");
  const seStillNew = await prisma.securityEvent.findUnique({
    where: { id: se.id },
  });
  assert(seStillNew?.status === "NEW", "Ack does not change SE triage status");

  // Inv claim ≠ assign
  await claimAttention({
    session: sessA,
    sourceType: "INVESTIGATION",
    sourceId: inv.id,
  });
  const invAfterClaim = await prisma.investigationGroup.findUnique({
    where: { id: inv.id },
  });
  assert(invAfterClaim?.assignedToUserId == null, "Inv claim does not assign");
  const listClaimed = await listAttentionItems(
    TEST_ORG,
    { pageSize: 100 },
    { viewerUserId: ANALYST_A }
  );
  const invItem = listClaimed.items.find((i) => i.sourceId === inv.id);
  assert(invItem?.isClaimed === true, "Inv shows claimed");
  assert(invItem?.claimedByUserId === ANALYST_A, "Inv claim holder set");
  assert(invItem?.isAssigned === false, "Inv not assigned after claim");
  assert(invItem?.assignedToUserId == null, "Inv assignedTo null after claim");

  // Assign does not claim
  await assignInvestigation({
    organizationId: TEST_ORG,
    actorId: ANALYST_A,
    groupId: inv.id,
    assignedToUserId: ANALYST_B,
  });
  const listAssigned = await listAttentionItems(
    TEST_ORG,
    { pageSize: 100 },
    { viewerUserId: ANALYST_B }
  );
  const invItem2 = listAssigned.items.find((i) => i.sourceId === inv.id);
  assert(invItem2?.assignedToUserId === ANALYST_B, "Inv formal assignee set");
  assert(
    invItem2?.claimedByUserId === ANALYST_A,
    "Prior claim preserved after assign"
  );
  assert(invItem2?.isAssigned === true, "isAssigned true");
  assert(
    invItem2?.isMine === true || invItem2?.claimedByUserId === ANALYST_A,
    "Claim still held by A (Mine filter uses claim for overlay)"
  );

  // Disabled claim target rejected
  let disabledBlocked = false;
  try {
    await claimAttention({
      session: session(ANALYST_A, TEST_ORG, "ADMIN"),
      sourceType: "SECURITY_EVENT",
      sourceId: se.id,
      assignToUserId: DISABLED_U,
    });
  } catch (e) {
    disabledBlocked =
      e instanceof Error && e.message.includes("not found in organization");
  }
  assert(disabledBlocked, "Disabled user cannot be claim target");

  // Cross-org claim target rejected
  let crossBlocked = false;
  try {
    await claimAttention({
      session: session(ANALYST_A, TEST_ORG, "ADMIN"),
      sourceType: "SECURITY_EVENT",
      sourceId: se.id,
      assignToUserId: OTHER_U,
    });
  } catch (e) {
    crossBlocked =
      e instanceof Error && e.message.includes("not found in organization");
  }
  assert(crossBlocked, "Cross-org claim target rejected");

  // Release claim does not clear assignee
  await releaseAttentionClaim({
    session: sessA,
    sourceType: "INVESTIGATION",
    sourceId: inv.id,
  });
  const invAfterRelease = await prisma.investigationGroup.findUnique({
    where: { id: inv.id },
  });
  assert(
    invAfterRelease?.assignedToUserId === ANALYST_B,
    "Release claim preserves formal assignee"
  );

  // Concurrent claim still single winner
  const se2 = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      title: "Own SE2",
      severity: "CRITICAL",
      status: "NEW",
      classification: "ACTIONABLE",
      source: "WAZUH",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `own-se2-${now.getTime()}`,
    },
  });
  const results = await Promise.allSettled([
    claimAttention({
      session: sessA,
      sourceType: "SECURITY_EVENT",
      sourceId: se2.id,
    }),
    claimAttention({
      session: sessB,
      sourceType: "SECURITY_EVENT",
      sourceId: se2.id,
    }),
  ]);
  const wins = results.filter((r) => r.status === "fulfilled").length;
  const conflicts = results.filter(
    (r) =>
      r.status === "rejected" && r.reason instanceof AttentionConflictError
  ).length;
  assert(wins === 1 && conflicts === 1, "Single active claimant under race");

  await cleanup();
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
