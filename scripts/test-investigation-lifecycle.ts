/**
 * Phase 6b2 — Investigation operational completeness tests.
 * Isolated TEST org — does not touch production data.
 * Run: npm run test:investigation-lifecycle
 */
import { PrismaClient } from "@prisma/client";
import {
  addInvestigationNote,
  assignInvestigation,
  closeInvestigation,
  editInvestigationNote,
  reopenInvestigation,
  resolveInvestigation,
  softDeleteInvestigationNote,
  transitionInvestigationStatus,
} from "../services/investigations/investigation-lifecycle.service";
import {
  createInvestigation,
  startInvestigation,
} from "../services/investigations/investigation.service";
import {
  assertInvestigationTransition,
  canReopenInvestigation,
} from "../services/investigations/status-transitions";

const prisma = new PrismaClient();

const TEST_ORG = "clyinvlifecycleorg0000001";
const OTHER_ORG = "clyinvlifecycleotherorg01";
const TEST_USER = "clyinvlifecycleuser000001";
const OTHER_USER = "clyinvlifecycleuser000002";
const CROSS_ORG_USER = "clyinvlifecyclexuser0001";

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

async function cleanup() {
  await prisma.investigationNote.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.investigationActivity.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.investigationGroupEvent.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.investigationGroup.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.securityEvent.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.auditLog.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.user.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: [TEST_ORG, OTHER_ORG] } },
  });
}

async function seed() {
  await cleanup();
  await prisma.organization.create({
    data: { id: TEST_ORG, name: "Inv Lifecycle Test", slug: "inv-lifecycle-test" },
  });
  await prisma.organization.create({
    data: { id: OTHER_ORG, name: "Inv Lifecycle Other", slug: "inv-lifecycle-other" },
  });
  await prisma.user.create({
    data: {
      id: TEST_USER,
      organizationId: TEST_ORG,
      email: "lifecycle-a@test.local",
      name: "Lifecycle Analyst A",
      role: "ANALYST",
    },
  });
  await prisma.user.create({
    data: {
      id: OTHER_USER,
      organizationId: TEST_ORG,
      email: "lifecycle-b@test.local",
      name: "Lifecycle Analyst B",
      role: "ANALYST",
    },
  });
  await prisma.user.create({
    data: {
      id: CROSS_ORG_USER,
      organizationId: OTHER_ORG,
      email: "lifecycle-x@test.local",
      name: "Cross Org",
      role: "ANALYST",
    },
  });
}

async function makeEvent(suffix: string) {
  const now = new Date();
  return prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      title: `Lifecycle SE ${suffix}`,
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      source: "WAZUH",
      firstSeenAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
      correlationKey: `lifecycle-${suffix}-${now.getTime()}`,
    },
  });
}

async function main() {
  console.log("\nInvestigation lifecycle (Phase 6b2)\n");
  await seed();

  // Transition matrix unit checks
  try {
    assertInvestigationTransition("OPEN", "IN_PROGRESS");
    assert(true, "OPEN → IN_PROGRESS allowed");
  } catch {
    assert(false, "OPEN → IN_PROGRESS allowed");
  }
  try {
    assertInvestigationTransition("OPEN", "CLOSED");
    assert(false, "OPEN → CLOSED rejected");
  } catch {
    assert(true, "OPEN → CLOSED rejected");
  }
  assert(canReopenInvestigation("RESOLVED"), "can reopen RESOLVED");
  assert(canReopenInvestigation("CLOSED"), "can reopen CLOSED");
  assert(!canReopenInvestigation("OPEN"), "cannot reopen OPEN");

  const event = await makeEvent("1");
  const group = await createInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    data: {
      title: "Lifecycle case",
      securityEventIds: [event.id],
      assignedToUserId: TEST_USER,
    },
  });

  const created = await prisma.investigationGroup.findUnique({
    where: { id: group.id },
  });
  assert(created?.status === "OPEN", "Created OPEN");
  assert(created?.assignedToUserId === TEST_USER, "Assignee set on create");
  assert(Boolean(created?.assignedAt), "assignedAt set on create");

  await startInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
  });
  const started = await prisma.investigationGroup.findUnique({
    where: { id: group.id },
  });
  assert(started?.status === "IN_PROGRESS", "Start → IN_PROGRESS");

  await transitionInvestigationStatus({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    toStatus: "PENDING",
  });
  const pending = await prisma.investigationGroup.findUnique({
    where: { id: group.id },
  });
  assert(pending?.status === "PENDING", "→ PENDING");

  // Assignment: reassign + history
  await assignInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    assignedToUserId: OTHER_USER,
  });
  const reassigned = await prisma.investigationGroup.findUnique({
    where: { id: group.id },
  });
  assert(reassigned?.assignedToUserId === OTHER_USER, "Reassigned");

  let crossOrgFailed = false;
  try {
    await assignInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      groupId: group.id,
      assignedToUserId: CROSS_ORG_USER,
    });
  } catch {
    crossOrgFailed = true;
  }
  assert(crossOrgFailed, "Cross-org assignment rejected");

  await assignInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    assignedToUserId: null,
  });
  const unassigned = await prisma.investigationGroup.findUnique({
    where: { id: group.id },
  });
  assert(unassigned?.assignedToUserId === null, "Unassigned");
  assert(unassigned?.assignedAt === null, "assignedAt cleared on unassign");

  // Notes
  const note = await addInvestigationNote({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    content: "Initial analyst note",
  });
  await editInvestigationNote({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    noteId: note.id,
    content: "Edited analyst note",
  });
  const edited = await prisma.investigationNote.findUnique({
    where: { id: note.id },
  });
  assert(edited?.content === "Edited analyst note", "Note edited");
  assert(Boolean(edited?.editedAt), "editedAt set");

  await softDeleteInvestigationNote({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    noteId: note.id,
  });
  const deleted = await prisma.investigationNote.findUnique({
    where: { id: note.id },
  });
  assert(Boolean(deleted?.deletedAt), "Note soft-deleted");

  // Resolve → Close → duplicate close → reopen preserves closure
  await resolveInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    resolutionSummary: "Root cause found",
  });
  const resolved = await prisma.investigationGroup.findUnique({
    where: { id: group.id },
  });
  assert(resolved?.status === "RESOLVED", "Resolved");

  await closeInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    resolutionSummary: "Contained and documented",
  });
  const closed = await prisma.investigationGroup.findUnique({
    where: { id: group.id },
  });
  assert(closed?.status === "CLOSED", "Closed");
  assert(closed?.closedByUserId === TEST_USER, "closedBy set");
  assert(Boolean(closed?.closedAt), "closedAt set");
  assert(
    closed?.resolutionSummary === "Contained and documented",
    "resolution summary stored"
  );

  let emptyCloseFailed = false;
  try {
    // reopen first so we can re-close with empty summary validation
    await reopenInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      groupId: group.id,
      reason: "New activity observed",
    });
  } catch {
    emptyCloseFailed = true;
  }
  assert(!emptyCloseFailed, "Reopen from CLOSED succeeds");

  const reopened = await prisma.investigationGroup.findUnique({
    where: { id: group.id },
  });
  assert(reopened?.status === "IN_PROGRESS", "Reopened → IN_PROGRESS");
  assert(
    reopened?.resolutionSummary === "Contained and documented",
    "Prior resolution summary preserved after reopen"
  );
  assert(Boolean(reopened?.closedAt), "Prior closedAt preserved after reopen");
  assert(reopened?.closedByUserId === TEST_USER, "Prior closer preserved");
  assert(Boolean(reopened?.reopenedAt), "reopenedAt set");
  assert(reopened?.lastReopenReason === "New activity observed", "reopen reason");

  let reopenOpenFailed = false;
  try {
    await reopenInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      groupId: group.id,
      reason: "should fail",
    });
  } catch {
    reopenOpenFailed = true;
  }
  assert(reopenOpenFailed, "Reopen from IN_PROGRESS rejected");

  let emptySummaryFailed = false;
  try {
    await resolveInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      groupId: group.id,
    });
    await closeInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      groupId: group.id,
      resolutionSummary: "   ",
    });
  } catch {
    emptySummaryFailed = true;
  }
  assert(emptySummaryFailed, "Empty resolution summary rejected on close");

  // Ensure currently RESOLVED (if empty close failed after resolve)
  const afterEmpty = await prisma.investigationGroup.findUnique({
    where: { id: group.id },
  });
  if (afterEmpty?.status !== "RESOLVED") {
    await resolveInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      groupId: group.id,
      resolutionSummary: "Ready to close again",
    });
  }

  await closeInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    resolutionSummary: "Final closure",
  });

  let duplicateCloseFailed = false;
  try {
    await closeInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      groupId: group.id,
      resolutionSummary: "Duplicate close",
    });
  } catch {
    duplicateCloseFailed = true;
  }
  assert(duplicateCloseFailed, "Duplicate close rejected");

  // Tenant isolation: other org cannot load/assign
  let otherOrgFailed = false;
  try {
    await assignInvestigation({
      organizationId: OTHER_ORG,
      actorId: CROSS_ORG_USER,
      groupId: group.id,
      assignedToUserId: CROSS_ORG_USER,
    });
  } catch {
    otherOrgFailed = true;
  }
  assert(otherOrgFailed, "Cross-tenant assign rejected");

  const activities = await prisma.investigationActivity.findMany({
    where: { groupId: group.id },
    select: { activityType: true },
  });
  const types = new Set(activities.map((a) => a.activityType));
  assert(types.has("CREATED"), "Timeline: CREATED");
  assert(types.has("ASSIGNED") || types.has("REASSIGNED"), "Timeline: assignment");
  assert(types.has("NOTE_ADDED"), "Timeline: NOTE_ADDED");
  assert(types.has("NOTE_EDITED"), "Timeline: NOTE_EDITED");
  assert(types.has("NOTE_DELETED"), "Timeline: NOTE_DELETED");
  assert(types.has("CLOSED"), "Timeline: CLOSED");
  assert(types.has("REOPENED"), "Timeline: REOPENED");
  assert(types.has("RESOLVED"), "Timeline: RESOLVED");

  const audits = await prisma.auditLog.findMany({
    where: { organizationId: TEST_ORG, resourceId: group.id },
    select: { action: true },
  });
  const auditActions = new Set(audits.map((a) => a.action));
  assert(auditActions.has("INVESTIGATION_ASSIGNED"), "Audit: assign");
  assert(auditActions.has("INVESTIGATION_CLOSED"), "Audit: close");
  assert(auditActions.has("INVESTIGATION_REOPENED"), "Audit: reopen");
  assert(auditActions.has("INVESTIGATION_NOTE_ADDED"), "Audit: note");

  await cleanup();

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
