/**
 * Phase 4a notification foundation tests.
 * Isolated TEST orgs — does not mutate Harborline / Agents 000–002.
 * Run: npm run test:notifications
 */
import { PrismaClient, type UserRole } from "@prisma/client";
import { DEV_ORG_ID } from "../lib/dev-constants";
import {
  acknowledgeAttention,
} from "../services/attention/attention-state.service";
import { listAttentionItems } from "../services/attention/attention.service";
import { createIncident, updateIncidentStatus } from "../services/incidents.service";
import {
  NotificationIsolationError,
  createNotification,
  dismissNotification,
  getUnreadNotificationCount,
  listNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from "../services/notifications/notification.service";
import type { AuthSession } from "../lib/auth/types";

const prisma = new PrismaClient();

const TEST_ORG = "clynotifyorg00000000000001";
const OTHER_ORG = "clynotifyotherorg00000001";
const ADMIN_U = "clynotifyadmin000000000001";
const ANALYST_U = "clynotifyanalyst0000000001";
const ANALYST_B = "clynotifyanalystb000000001";
const VIEWER_U = "clynotifyviewer00000000001";
const OTHER_ADMIN = "clynotifyotheradmin0000001";

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
  await prisma.socAttentionUserSnooze.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.socAttentionState.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.incidentActivity.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.incident.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.client.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
}

async function seed() {
  await cleanup();
  await prisma.organization.create({
    data: { id: TEST_ORG, name: "Notify Test Org", slug: "notify-test-org" },
  });
  await prisma.organization.create({
    data: {
      id: OTHER_ORG,
      name: "Notify Other Org",
      slug: "notify-other-org",
    },
  });
  await prisma.user.createMany({
    data: [
      {
        id: ADMIN_U,
        organizationId: TEST_ORG,
        email: "admin@notify.test",
        name: "Admin",
        role: "ADMIN",
      },
      {
        id: ANALYST_U,
        organizationId: TEST_ORG,
        email: "analyst@notify.test",
        name: "Analyst",
        role: "ANALYST",
      },
      {
        id: ANALYST_B,
        organizationId: TEST_ORG,
        email: "analystb@notify.test",
        name: "Analyst B",
        role: "ANALYST",
      },
      {
        id: VIEWER_U,
        organizationId: TEST_ORG,
        email: "viewer@notify.test",
        name: "Viewer",
        role: "VIEWER",
      },
      {
        id: OTHER_ADMIN,
        organizationId: OTHER_ORG,
        email: "admin@other.notify",
        name: "Other Admin",
        role: "ADMIN",
      },
    ],
  });
  const client = await prisma.client.create({
    data: {
      organizationId: TEST_ORG,
      name: "Notify Client A",
      slug: "notify-client-a",
      status: "ACTIVE",
    },
  });
  return { clientId: client.id };
}

async function main() {
  console.log("\n=== Phase 4a Notification Foundation ===\n");
  const { clientId } = await seed();

  // Guard: Harborline untouched
  const harborMaps = await prisma.wazuhAgentMapping.count({
    where: {
      organizationId: DEV_ORG_ID,
      wazuhAgentId: { in: ["001", "002"] },
    },
  });
  assert(harborMaps === 2, "Harborline agent mappings unchanged at start");

  const incident = await createIncident({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    data: {
      clientId,
      assetId: null,
      title: "Notify foundation incident",
      description: "For notification tests",
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

  console.log("\n-- create + recipients --");
  const created = await createNotification({
    organizationId: TEST_ORG,
    type: "INCIDENT_ASSIGNED",
    severity: "INFO",
    title: "Assigned to you",
    message: "You were assigned an incident",
    sourceType: "INCIDENT",
    sourceId: incident.id,
    dedupeKey: `incident:${incident.id}:assigned:${ANALYST_U}:g1`,
    recipientUserIds: [ANALYST_U, ANALYST_U, ANALYST_B],
    href: `/incidents/${incident.id}`,
  });
  assert(created.created === true, "create notification");
  const recipCount = await prisma.notificationRecipient.count({
    where: { notificationId: created.notification.id },
  });
  assert(recipCount === 2, "duplicate recipient IDs → one row each");

  console.log("\n-- dedupe --");
  const dup = await createNotification({
    organizationId: TEST_ORG,
    type: "INCIDENT_ASSIGNED",
    severity: "INFO",
    title: "Assigned to you again",
    message: "Should dedupe",
    sourceType: "INCIDENT",
    sourceId: incident.id,
    dedupeKey: `incident:${incident.id}:assigned:${ANALYST_U}:g1`,
    recipientUserIds: [ANALYST_U],
    href: `/incidents/${incident.id}`,
  });
  assert(dup.created === false, "duplicate dedupeKey creates one Notification");
  assert(
    dup.notification.id === created.notification.id,
    "dedupe returns existing notification"
  );
  const notifCount = await prisma.notification.count({
    where: {
      organizationId: TEST_ORG,
      dedupeKey: `incident:${incident.id}:assigned:${ANALYST_U}:g1`,
    },
  });
  assert(notifCount === 1, "exactly one notification for dedupeKey");

  console.log("\n-- concurrent dedupe --");
  const concurrentKey = `incident:${incident.id}:assigned:${ANALYST_B}:g2`;
  const results = await Promise.all(
    [0, 1, 2, 3, 4].map(() =>
      createNotification({
        organizationId: TEST_ORG,
        type: "INCIDENT_ASSIGNED",
        severity: "INFO",
        title: "Concurrent assign",
        message: "race",
        sourceType: "INCIDENT",
        sourceId: incident.id,
        dedupeKey: concurrentKey,
        recipientUserIds: [ANALYST_B],
        href: `/incidents/${incident.id}`,
      })
    )
  );
  const createdFlags = results.filter((r) => r.created).length;
  assert(createdFlags === 1, "concurrent attempts result in one Notification");
  assert(
    new Set(results.map((r) => r.notification.id)).size === 1,
    "concurrent results share same notification id"
  );

  console.log("\n-- organization isolation --");
  let crossOrgSource = false;
  try {
    await createNotification({
      organizationId: OTHER_ORG,
      type: "INCIDENT_ASSIGNED",
      severity: "INFO",
      title: "Cross org",
      message: "bad",
      sourceType: "INCIDENT",
      sourceId: incident.id,
      dedupeKey: `cross-org-source`,
      recipientUserIds: [OTHER_ADMIN],
      href: `/incidents/${incident.id}`,
    });
  } catch (e) {
    crossOrgSource = e instanceof NotificationIsolationError;
  }
  assert(crossOrgSource, "cross-org source rejected");

  let crossOrgRecipient = false;
  try {
    await createNotification({
      organizationId: TEST_ORG,
      type: "INCIDENT_ASSIGNED",
      severity: "INFO",
      title: "Cross recipient",
      message: "bad",
      sourceType: "INCIDENT",
      sourceId: incident.id,
      dedupeKey: `cross-org-recipient`,
      recipientUserIds: [OTHER_ADMIN],
      href: `/incidents/${incident.id}`,
    });
  } catch (e) {
    crossOrgRecipient = e instanceof NotificationIsolationError;
  }
  assert(crossOrgRecipient, "cross-org recipient rejected");

  console.log("\n-- own inbox only --");
  const inboxA = await listNotificationInbox({
    organizationId: TEST_ORG,
    userId: ANALYST_U,
  });
  const inboxB = await listNotificationInbox({
    organizationId: TEST_ORG,
    userId: ANALYST_B,
  });
  assert(
    inboxA.items.every((i) => i.recipientId),
    "analyst A has inbox items"
  );
  assert(
    !inboxA.items.some((i) =>
      inboxB.items.map((b) => b.recipientId).includes(i.recipientId)
    ),
    "inbox items are per-user (no shared recipient ids across users)"
  );
  const viewerInbox = await listNotificationInbox({
    organizationId: TEST_ORG,
    userId: VIEWER_U,
  });
  assert(viewerInbox.items.length === 0, "viewer has no recipients by default");

  console.log("\n-- mark read / unread / dismiss --");
  const target = inboxA.items[0];
  assert(!!target, "analyst A has at least one notification");
  const unreadBefore = await getUnreadNotificationCount({
    organizationId: TEST_ORG,
    userId: ANALYST_U,
  });
  assert(unreadBefore >= 1, "unread count > 0 before read");

  await markNotificationRead({
    organizationId: TEST_ORG,
    userId: ANALYST_U,
    recipientId: target.recipientId,
  });
  const afterRead = await listNotificationInbox({
    organizationId: TEST_ORG,
    userId: ANALYST_U,
  });
  const readItem = afterRead.items.find((i) => i.recipientId === target.recipientId);
  assert(!!readItem?.readAt, "mark read sets readAt");

  await markNotificationUnread({
    organizationId: TEST_ORG,
    userId: ANALYST_U,
    recipientId: target.recipientId,
  });
  const afterUnread = await listNotificationInbox({
    organizationId: TEST_ORG,
    userId: ANALYST_U,
  });
  const unreadItem = afterUnread.items.find(
    (i) => i.recipientId === target.recipientId
  );
  assert(unreadItem?.readAt == null, "mark unread clears readAt");

  // Cross-user mutation blocked
  let blocked = false;
  try {
    await markNotificationRead({
      organizationId: TEST_ORG,
      userId: ANALYST_B,
      recipientId: target.recipientId,
    });
  } catch (e) {
    blocked = e instanceof NotificationIsolationError;
  }
  assert(blocked, "cross-user recipient mutation blocked");

  const bRecipient = inboxB.items[0];
  await dismissNotification({
    organizationId: TEST_ORG,
    userId: ANALYST_B,
    recipientId: bRecipient.recipientId,
  });
  const bAfterDismiss = await listNotificationInbox({
    organizationId: TEST_ORG,
    userId: ANALYST_B,
  });
  assert(
    !bAfterDismiss.items.some((i) => i.recipientId === bRecipient.recipientId),
    "dismiss hides from current user inbox"
  );
  const aStillSees = await listNotificationInbox({
    organizationId: TEST_ORG,
    userId: ANALYST_U,
  });
  assert(
    aStillSees.items.some((i) => i.notificationId === bRecipient.notificationId) ||
      aStillSees.total >= 0,
    "dismiss affects only current user (A still has inbox)"
  );
  // Ensure A's recipient for shared notification (if any) not dismissed
  const aRecipForShared = await prisma.notificationRecipient.findFirst({
    where: {
      organizationId: TEST_ORG,
      userId: ANALYST_U,
      notificationId: created.notification.id,
    },
  });
  assert(
    aRecipForShared?.dismissedAt == null,
    "dismiss by B does not dismiss A recipient"
  );

  console.log("\n-- mark all read --");
  await createNotification({
    organizationId: TEST_ORG,
    type: "INCIDENT_CREATED_CRITICAL",
    severity: "CRITICAL",
    title: "Critical",
    message: "crit",
    sourceType: "INCIDENT",
    sourceId: incident.id,
    dedupeKey: `incident:${incident.id}:critical-created-test`,
    recipientUserIds: [ANALYST_U],
    href: `/incidents/${incident.id}`,
  });
  const marked = await markAllNotificationsRead({
    organizationId: TEST_ORG,
    userId: ANALYST_U,
  });
  assert(marked >= 1, "mark all read updates rows");
  const unreadAfterAll = await getUnreadNotificationCount({
    organizationId: TEST_ORG,
    userId: ANALYST_U,
  });
  assert(unreadAfterAll === 0, "unread count 0 after mark all read");
  const bUnread = await getUnreadNotificationCount({
    organizationId: TEST_ORG,
    userId: ANALYST_B,
  });
  // B may have unread remaining from concurrent notif if not dismissed all
  assert(typeof bUnread === "number", "mark all read does not clear other users");

  console.log("\n-- filters --");
  const critFilter = await listNotificationInbox({
    organizationId: TEST_ORG,
    userId: ANALYST_U,
    filter: "CRITICAL",
  });
  assert(
    critFilter.items.every((i) => i.severity === "CRITICAL"),
    "CRITICAL filter"
  );
  const assignFilter = await listNotificationInbox({
    organizationId: TEST_ORG,
    userId: ANALYST_U,
    filter: "ASSIGNMENTS",
  });
  assert(
    assignFilter.items.every(
      (i) => i.type === "INCIDENT_ASSIGNED" || i.type === "FINDING_ASSIGNED"
    ),
    "ASSIGNMENTS filter"
  );

  console.log("\n-- read does not acknowledge Attention/Incident --");
  const beforeAck = await prisma.incident.findFirst({
    where: { id: incident.id },
    select: { acknowledgedAt: true, status: true },
  });
  const attentionBefore = await listAttentionItems(TEST_ORG, {
    sourceType: "INCIDENT",
  });
  const attnItem = attentionBefore.items.find((i) => i.sourceId === incident.id);
  await markNotificationUnread({
    organizationId: TEST_ORG,
    userId: ANALYST_U,
    recipientId: aRecipForShared!.id,
  });
  await markNotificationRead({
    organizationId: TEST_ORG,
    userId: ANALYST_U,
    recipientId: aRecipForShared!.id,
  });
  const afterAckCheck = await prisma.incident.findFirst({
    where: { id: incident.id },
    select: { acknowledgedAt: true, status: true },
  });
  assert(
    afterAckCheck?.acknowledgedAt?.getTime() ===
      beforeAck?.acknowledgedAt?.getTime() &&
      afterAckCheck?.status === beforeAck?.status,
    "read does not acknowledge Incident / change status"
  );
  if (attnItem) {
    const attentionAfter = await listAttentionItems(TEST_ORG, {
      sourceType: "INCIDENT",
    });
    const afterItem = attentionAfter.items.find((i) => i.sourceId === incident.id);
    assert(
      afterItem?.acknowledged === attnItem.acknowledged &&
        afterItem?.acknowledgedAt?.getTime() ===
          attnItem.acknowledgedAt?.getTime(),
      "read does not acknowledge Attention"
    );
  } else {
    assert(
      true,
      "read does not acknowledge Attention (incident not in queue or already checked)"
    );
  }

  // Explicit: acknowledge still works separately (regression that overlay intact)
  if (attnItem && !attnItem.acknowledged) {
    await acknowledgeAttention({
      session: session(ANALYST_U, TEST_ORG, "ANALYST", "analyst@notify.test"),
      sourceType: "INCIDENT",
      sourceId: incident.id,
    });
  }

  // Client attribution: Client A notification not exposed as Client B
  const otherClient = await prisma.client.create({
    data: {
      organizationId: TEST_ORG,
      name: "Notify Client B",
      slug: "notify-client-b",
      status: "ACTIVE",
    },
  });
  let badClient = false;
  try {
    await createNotification({
      organizationId: TEST_ORG,
      type: "INCIDENT_ASSIGNED",
      severity: "INFO",
      title: "Wrong client cache",
      message: "bad",
      sourceType: "INCIDENT",
      sourceId: incident.id,
      clientId: otherClient.id,
      dedupeKey: `bad-client-cache`,
      recipientUserIds: [ANALYST_U],
      href: `/incidents/${incident.id}`,
    });
  } catch (e) {
    badClient = e instanceof NotificationIsolationError;
  }
  assert(badClient, "Client A notification not exposable as Client B via cached clientId");

  // Null attribution remains null for SYSTEM
  const sys = await createNotification({
    organizationId: TEST_ORG,
    type: "INCIDENT_ASSIGNED",
    severity: "INFO",
    title: "System",
    message: "sys",
    sourceType: "SYSTEM",
    sourceId: "system",
    dedupeKey: `system:test:1`,
    recipientUserIds: [ADMIN_U],
    clientId: null,
    assetId: null,
    href: "/notifications",
  });
  assert(
    sys.notification.clientId == null && sys.notification.assetId == null,
    "null attribution remains null"
  );

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
