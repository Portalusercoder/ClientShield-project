/**
 * Phase 6b4 — Investigation ↔ Finding continuity tests.
 * Isolated TEST org — does not touch production data.
 * Run: npm run test:investigation-findings
 */
import { PrismaClient } from "@prisma/client";
import {
  buildFindingTitleSuggestion,
  createFindingFromInvestigation,
  getFindingPrimaryInvestigation,
  linkFindingToInvestigation,
  listInvestigationFindings,
  searchLinkableFindings,
  unlinkFindingFromInvestigation,
} from "../services/investigations/investigation-finding.service";
import {
  assignInvestigation,
  closeInvestigation,
  resolveInvestigation,
} from "../services/investigations/investigation-lifecycle.service";
import { createInvestigation } from "../services/investigations/investigation.service";

const prisma = new PrismaClient();

const TEST_ORG = "clyinvfindingsorg00000001";
const OTHER_ORG = "clyinvfindingsotherorg001";
const TEST_USER = "clyinvfindingsuser000001";
const OTHER_USER = "clyinvfindingsuser000002";
const CROSS_ORG_USER = "clyinvfindingsxuser00001";
const TEST_CLIENT = "clyinvfindingsclient00001";
const OTHER_CLIENT = "clyinvfindingsclient00002";
const TEST_ASSET = "clyinvfindingsasset000001";
const OTHER_ASSET = "clyinvfindingsasset000002";
const CROSS_ASSET = "clyinvfindingsxasset00001";

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
  await prisma.investigationActivity.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.investigationGroupEvent.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.finding.deleteMany({
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
  await prisma.asset.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.client.deleteMany({
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
    data: {
      id: TEST_ORG,
      name: "Inv Findings Test",
      slug: "inv-findings-test",
    },
  });
  await prisma.organization.create({
    data: {
      id: OTHER_ORG,
      name: "Inv Findings Other",
      slug: "inv-findings-other",
    },
  });
  await prisma.user.create({
    data: {
      id: TEST_USER,
      organizationId: TEST_ORG,
      email: "inv-findings-a@test.local",
      name: "Findings Analyst A",
      role: "ANALYST",
    },
  });
  await prisma.user.create({
    data: {
      id: OTHER_USER,
      organizationId: TEST_ORG,
      email: "inv-findings-b@test.local",
      name: "Findings Analyst B",
      role: "ANALYST",
    },
  });
  await prisma.user.create({
    data: {
      id: CROSS_ORG_USER,
      organizationId: OTHER_ORG,
      email: "inv-findings-x@test.local",
      name: "Cross Org",
      role: "ANALYST",
    },
  });
  await prisma.client.create({
    data: {
      id: TEST_CLIENT,
      organizationId: TEST_ORG,
      name: "Findings Client A",
      slug: "findings-client-a",
      status: "ACTIVE",
    },
  });
  await prisma.client.create({
    data: {
      id: OTHER_CLIENT,
      organizationId: TEST_ORG,
      name: "Findings Client B",
      slug: "findings-client-b",
      status: "ACTIVE",
    },
  });
  await prisma.asset.create({
    data: {
      id: TEST_ASSET,
      organizationId: TEST_ORG,
      clientId: TEST_CLIENT,
      name: "Findings Asset A",
      type: "SERVER",
      hostname: "findings-a.local",
      authorizationStatus: "AUTHORIZED",
      monitoringStatus: "ACTIVE",
    },
  });
  await prisma.asset.create({
    data: {
      id: OTHER_ASSET,
      organizationId: TEST_ORG,
      clientId: OTHER_CLIENT,
      name: "Findings Asset B",
      type: "SERVER",
      hostname: "findings-b.local",
      authorizationStatus: "AUTHORIZED",
      monitoringStatus: "ACTIVE",
    },
  });
  await prisma.asset.create({
    data: {
      id: CROSS_ASSET,
      organizationId: OTHER_ORG,
      clientId: (
        await prisma.client.create({
          data: {
            organizationId: OTHER_ORG,
            name: "Cross Client",
            slug: "inv-findings-cross-client",
            status: "ACTIVE",
          },
        })
      ).id,
      name: "Cross Org Asset",
      type: "SERVER",
      hostname: "cross.local",
      authorizationStatus: "AUTHORIZED",
      monitoringStatus: "ACTIVE",
    },
  });
}

async function makeEvent(suffix: string) {
  const now = new Date();
  return prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: TEST_CLIENT,
      assetId: TEST_ASSET,
      title: `Findings SE ${suffix}`,
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      source: "WAZUH",
      firstSeenAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
      correlationKey: `inv-findings-${suffix}-${now.getTime()}`,
    },
  });
}

async function main() {
  console.log("\nInvestigation ↔ Finding continuity (Phase 6b4)\n");
  await seed();

  assert(
    buildFindingTitleSuggestion("Case Alpha").includes("Case Alpha"),
    "Title suggestion includes investigation title"
  );

  const event = await makeEvent("1");
  const group = await createInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    data: {
      title: "Findings continuity case",
      severity: "HIGH",
      securityEventIds: [event.id],
    },
  });

  await assignInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    assignedToUserId: TEST_USER,
  });

  const created = await createFindingFromInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    title: "Concluded: credential stuffing",
    description: "Analyst conclusion from investigation",
    assetId: TEST_ASSET,
    inheritAssignee: true,
  });
  assert(Boolean(created.findingId), "Create Finding returns id");

  const finding = await prisma.finding.findUnique({
    where: { id: created.findingId },
  });
  assert(finding?.investigationGroupId === group.id, "Primary Investigation set");
  assert(finding?.severity === "HIGH", "Severity inherited from Investigation");
  assert(finding?.assignedToUserId === TEST_USER, "Assignee inherited");
  assert(finding?.source === "MANUAL", "Source MANUAL");
  assert(finding?.status === "OPEN", "Finding starts OPEN");

  const evidence = finding?.evidence as {
    relatedSecurityEventIds?: string[];
  } | null;
  assert(
    evidence?.relatedSecurityEventIds?.includes(event.id) === true,
    "Related SE IDs stored in evidence"
  );

  const primary = await getFindingPrimaryInvestigation(
    TEST_ORG,
    created.findingId
  );
  assert(primary?.id === group.id, "getFindingPrimaryInvestigation");

  const listed = await listInvestigationFindings(TEST_ORG, group.id);
  assert(listed.length === 1, "listInvestigationFindings returns created");

  const createActivity = await prisma.investigationActivity.findFirst({
    where: {
      organizationId: TEST_ORG,
      groupId: group.id,
      activityType: "FINDING_CREATED",
    },
  });
  assert(Boolean(createActivity), "FINDING_CREATED activity");

  const createAudit = await prisma.auditLog.findFirst({
    where: {
      organizationId: TEST_ORG,
      action: "FINDING_CREATED",
      resourceId: created.findingId,
    },
  });
  assert(Boolean(createAudit), "FINDING_CREATED audit");

  // Independent severity after create
  await prisma.finding.update({
    where: { id: created.findingId },
    data: { severity: "CRITICAL" },
  });
  await prisma.investigationGroup.update({
    where: { id: group.id },
    data: { severity: "MEDIUM" },
  });
  const afterSev = await prisma.finding.findUnique({
    where: { id: created.findingId },
  });
  const afterInv = await prisma.investigationGroup.findUnique({
    where: { id: group.id },
  });
  assert(afterSev?.severity === "CRITICAL", "Finding severity independent");
  assert(afterInv?.severity === "MEDIUM", "Investigation severity independent");

  // Status propagation: Finding RESOLVED does not change Investigation
  const invStatusBefore = (
    await prisma.investigationGroup.findUnique({ where: { id: group.id } })
  )?.status;
  await prisma.finding.update({
    where: { id: created.findingId },
    data: { status: "RESOLVED" },
  });
  const invAfterFindingResolved = await prisma.investigationGroup.findUnique({
    where: { id: group.id },
  });
  assert(
    invAfterFindingResolved?.status === invStatusBefore,
    "Investigation status unchanged after Finding RESOLVED"
  );

  // Restore for link tests
  await prisma.finding.update({
    where: { id: created.findingId },
    data: { status: "OPEN", severity: "HIGH" },
  });
  await prisma.investigationGroup.update({
    where: { id: group.id },
    data: { severity: "HIGH" },
  });

  try {
    await linkFindingToInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      groupId: group.id,
      findingId: created.findingId,
    });
    assert(false, "Duplicate link rejected");
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes("already linked"),
      "Duplicate link rejected"
    );
  }

  await unlinkFindingFromInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    findingId: created.findingId,
  });
  const unlinked = await prisma.finding.findUnique({
    where: { id: created.findingId },
  });
  assert(unlinked?.investigationGroupId === null, "Unlink clears primary");
  const unlinkActivity = await prisma.investigationActivity.findFirst({
    where: {
      organizationId: TEST_ORG,
      groupId: group.id,
      activityType: "FINDING_UNLINKED",
    },
  });
  assert(Boolean(unlinkActivity), "FINDING_UNLINKED activity");

  await linkFindingToInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    findingId: created.findingId,
  });
  const relinked = await prisma.finding.findUnique({
    where: { id: created.findingId },
  });
  assert(relinked?.investigationGroupId === group.id, "Link existing works");
  const linkActivity = await prisma.investigationActivity.findFirst({
    where: {
      organizationId: TEST_ORG,
      groupId: group.id,
      activityType: "FINDING_LINKED",
    },
  });
  assert(Boolean(linkActivity), "FINDING_LINKED activity");

  const crossFinding = await prisma.finding.create({
    data: {
      organizationId: OTHER_ORG,
      assetId: CROSS_ASSET,
      source: "MANUAL",
      title: "Cross-org finding",
      severity: "LOW",
      status: "OPEN",
    },
  });
  try {
    await linkFindingToInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      groupId: group.id,
      findingId: crossFinding.id,
    });
    assert(false, "Cross-org link rejected");
  } catch (e) {
    assert(
      e instanceof Error && e.message.toLowerCase().includes("not found"),
      "Cross-org link rejected"
    );
  }

  try {
    await createFindingFromInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      groupId: group.id,
      title: "Wrong client asset",
      assetId: OTHER_ASSET,
    });
    assert(false, "Cross-client asset create rejected");
  } catch (e) {
    assert(
      e instanceof Error && e.message.toLowerCase().includes("client"),
      "Cross-client asset create rejected"
    );
  }

  await unlinkFindingFromInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    findingId: created.findingId,
  });
  const linkable = await searchLinkableFindings({
    organizationId: TEST_ORG,
    groupId: group.id,
    query: "credential",
  });
  assert(
    linkable.some((f) => f.id === created.findingId),
    "searchLinkableFindings finds unlinked"
  );

  await resolveInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    resolutionSummary: "Done for test",
  });
  await closeInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    resolutionSummary: "Closed for link-block test",
  });

  try {
    await createFindingFromInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      groupId: group.id,
      title: "Should fail on closed",
      assetId: TEST_ASSET,
    });
    assert(false, "Create blocked on CLOSED investigation");
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes("CLOSED"),
      "Create blocked on CLOSED investigation"
    );
  }

  try {
    await linkFindingToInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      groupId: group.id,
      findingId: created.findingId,
    });
    assert(false, "Link blocked on CLOSED investigation");
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes("CLOSED"),
      "Link blocked on CLOSED investigation"
    );
  }

  // Investigation CLOSED does not change already-linked Finding status
  const event2 = await makeEvent("2");
  const group2 = await createInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    data: {
      title: "Close independence case",
      severity: "MEDIUM",
      securityEventIds: [event2.id],
    },
  });
  const created2 = await createFindingFromInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group2.id,
    title: "Stays open when inv closes",
    assetId: TEST_ASSET,
    severity: "LOW",
  });
  assert(
    (await prisma.finding.findUnique({ where: { id: created2.findingId } }))
      ?.severity === "LOW",
    "Explicit severity overrides inherit"
  );

  await resolveInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group2.id,
    resolutionSummary: "Closing independence",
  });
  await closeInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group2.id,
    resolutionSummary: "Independence check",
  });
  const findingAfterInvClose = await prisma.finding.findUnique({
    where: { id: created2.findingId },
  });
  assert(
    findingAfterInvClose?.status === "OPEN",
    "Finding stays OPEN when Investigation CLOSED"
  );
  assert(
    findingAfterInvClose?.investigationGroupId === group2.id,
    "Primary link preserved after Investigation CLOSED"
  );

  try {
    await linkFindingToInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      groupId: group2.id,
      findingId: "nonexistent-finding-id",
    });
    assert(false, "Invalid finding id rejected");
  } catch (e) {
    assert(
      e instanceof Error &&
        (e.message.includes("not found") || e.message.includes("CLOSED")),
      "Invalid finding id rejected"
    );
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  await cleanup();
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
