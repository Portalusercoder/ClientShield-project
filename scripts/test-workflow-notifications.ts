/**
 * Phase 6b5 — notification preferences + new producers.
 * Isolated TEST org. Run: npm run test:workflow-notifications
 */
import { PrismaClient } from "@prisma/client";
import {
  filterInAppRecipients,
  listUserNotificationPreferences,
  upsertNotificationPreference,
} from "../services/notifications/notification-preferences.service";
import {
  notifyFindingCreated,
  notifyIncidentResolved,
  notifyInvestigationAssigned,
  notifyInvestigationReopened,
} from "../services/notifications/notification-producers.service";
import { createNotification } from "../services/notifications/notification.service";

const prisma = new PrismaClient();

const TEST_ORG = "clywfnotifyorg000000000001";
const OTHER_ORG = "clywfnotifyotherorg0000001";
const USER_A = "clywfnotifyusera0000000001";
const USER_B = "clywfnotifyuserb0000000001";
const USER_X = "clywfnotifyuserx0000000001";

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
  await prisma.notificationRecipient.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.notification.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.notificationPreference.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.investigationActivity.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.investigationGroup.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.finding.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.incident.deleteMany({
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
    data: { id: TEST_ORG, name: "WF Notify", slug: "wf-notify-test" },
  });
  await prisma.organization.create({
    data: { id: OTHER_ORG, name: "WF Other", slug: "wf-notify-other" },
  });
  for (const [id, email, org] of [
    [USER_A, "a@wf.test", TEST_ORG],
    [USER_B, "b@wf.test", TEST_ORG],
    [USER_X, "x@wf.test", OTHER_ORG],
  ] as const) {
    await prisma.user.create({
      data: {
        id,
        organizationId: org,
        email,
        name: email,
        role: "ANALYST",
      },
    });
  }
  const client = await prisma.client.create({
    data: {
      organizationId: TEST_ORG,
      name: "WF Client",
      slug: "wf-client",
      status: "ACTIVE",
    },
  });
  const asset = await prisma.asset.create({
    data: {
      organizationId: TEST_ORG,
      clientId: client.id,
      name: "WF Asset",
      type: "SERVER",
      hostname: "wf.local",
      authorizationStatus: "AUTHORIZED",
      monitoringStatus: "ACTIVE",
    },
  });
  return { clientId: client.id, assetId: asset.id };
}

async function main() {
  console.log("\nWorkflow notifications (Phase 6b5)\n");
  const { clientId, assetId } = await seed();

  const defaults = await listUserNotificationPreferences({
    organizationId: TEST_ORG,
    userId: USER_A,
  });
  assert(defaults.length > 0, "Default preferences expanded");
  assert(
    defaults.every((d) =>
      d.channel === "IN_APP" ? d.enabled : !d.enabled
    ),
    "Defaults: IN_APP on, others off"
  );

  // Preference filter: disable IN_APP for INVESTIGATION_ASSIGNED
  await upsertNotificationPreference({
    organizationId: TEST_ORG,
    userId: USER_A,
    eventType: "INVESTIGATION_ASSIGNED",
    channel: "IN_APP",
    enabled: false,
  });
  const filtered = await filterInAppRecipients({
    organizationId: TEST_ORG,
    eventType: "INVESTIGATION_ASSIGNED",
    userIds: [USER_A, USER_B],
  });
  assert(
    filtered.length === 1 && filtered[0] === USER_B,
    "IN_APP preference filters recipients"
  );

  const inv = await prisma.investigationGroup.create({
    data: {
      organizationId: TEST_ORG,
      clientId,
      assetId,
      title: "WF Investigation",
      status: "OPEN",
      severity: "HIGH",
      createdByType: "ANALYST_CREATED",
      createdByUserId: USER_B,
      groupingExplanation: "test",
    },
  });

  await notifyInvestigationAssigned({
    organizationId: TEST_ORG,
    investigationId: inv.id,
    title: inv.title,
    assigneeUserId: USER_A,
    actorId: USER_B,
    clientId,
    assetId,
    assignmentGeneration: 1,
  });
  const assignedNote = await prisma.notification.findFirst({
    where: {
      organizationId: TEST_ORG,
      type: "INVESTIGATION_ASSIGNED",
      sourceId: inv.id,
    },
    include: { recipients: true },
  });
  assert(Boolean(assignedNote), "INVESTIGATION_ASSIGNED stored");
  assert(
    assignedNote?.recipients.length === 0,
    "Preference-disabled user not a recipient"
  );

  // Re-enable and assign to B
  await upsertNotificationPreference({
    organizationId: TEST_ORG,
    userId: USER_A,
    eventType: "INVESTIGATION_ASSIGNED",
    channel: "IN_APP",
    enabled: true,
  });
  await notifyInvestigationAssigned({
    organizationId: TEST_ORG,
    investigationId: inv.id,
    title: inv.title,
    assigneeUserId: USER_B,
    actorId: USER_A,
    clientId,
    assetId,
    assignmentGeneration: 2,
  });
  const assignedB = await prisma.notification.findFirst({
    where: {
      organizationId: TEST_ORG,
      dedupeKey: `investigation:${inv.id}:assigned:${USER_B}:g2`,
    },
    include: { recipients: true },
  });
  assert(
    assignedB?.recipients.some((r) => r.userId === USER_B) === true,
    "Assignee receives INVESTIGATION_ASSIGNED"
  );

  await notifyInvestigationReopened({
    organizationId: TEST_ORG,
    investigationId: inv.id,
    title: inv.title,
    actorId: USER_A,
    assigneeUserId: USER_B,
    createdByUserId: USER_B,
    clientId,
    assetId,
    reopenGeneration: 1,
  });
  assert(
    Boolean(
      await prisma.notification.findFirst({
        where: { organizationId: TEST_ORG, type: "INVESTIGATION_REOPENED" },
      })
    ),
    "INVESTIGATION_REOPENED stored"
  );

  const finding = await prisma.finding.create({
    data: {
      organizationId: TEST_ORG,
      clientId,
      assetId,
      source: "MANUAL",
      title: "WF Finding",
      severity: "MEDIUM",
      status: "OPEN",
      assignedToUserId: USER_B,
    },
  });
  await notifyFindingCreated({
    organizationId: TEST_ORG,
    findingId: finding.id,
    title: finding.title,
    actorId: USER_A,
    assigneeUserId: USER_B,
    investigationId: inv.id,
    clientId,
    assetId,
  });
  assert(
    Boolean(
      await prisma.notification.findFirst({
        where: { organizationId: TEST_ORG, type: "FINDING_CREATED" },
      })
    ),
    "FINDING_CREATED stored"
  );

  const incident = await prisma.incident.create({
    data: {
      organizationId: TEST_ORG,
      clientId,
      assetId,
      title: "WF Incident",
      severity: "HIGH",
      status: "INVESTIGATING",
      category: "MALWARE",
      source: "MANUAL",
      createdByUserId: USER_A,
      assignedToUserId: USER_B,
      caseNumber: "WF-001",
    },
  });
  await notifyIncidentResolved({
    organizationId: TEST_ORG,
    incidentId: incident.id,
    title: incident.title,
    actorId: USER_A,
    assigneeUserId: USER_B,
    leadAnalystUserId: null,
    commanderUserId: null,
    clientId,
    assetId,
  });
  assert(
    Boolean(
      await prisma.notification.findFirst({
        where: { organizationId: TEST_ORG, type: "INCIDENT_RESOLVED" },
      })
    ),
    "INCIDENT_RESOLVED stored"
  );

  // Cross-org recipient rejected
  try {
    await createNotification({
      organizationId: TEST_ORG,
      type: "CLAIM_TRANSFERRED",
      severity: "INFO",
      title: "x",
      message: "x",
      sourceType: "SYSTEM",
      sourceId: "sys",
      dedupeKey: "cross-org-test",
      recipientUserIds: [USER_X],
    });
    assert(false, "Cross-org recipient rejected");
  } catch {
    assert(true, "Cross-org recipient rejected");
  }

  // Future channels can be stored without delivery
  await upsertNotificationPreference({
    organizationId: TEST_ORG,
    userId: USER_A,
    eventType: "INCIDENT_ASSIGNED",
    channel: "EMAIL",
    enabled: true,
  });
  const emailPref = await prisma.notificationPreference.findFirst({
    where: {
      organizationId: TEST_ORG,
      userId: USER_A,
      eventType: "INCIDENT_ASSIGNED",
      channel: "EMAIL",
      enabled: true,
    },
  });
  assert(Boolean(emailPref), "EMAIL preference stored (no delivery)");

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
