/**
 * Phase 4b immediate notification producer + dedupe tests.
 * Isolated TEST orgs — does not mutate Harborline / Agents 000–002.
 * Run: npm run test:notification-producers
 */
import { PrismaClient, type UserRole } from "@prisma/client";
import { DEV_ORG_ID } from "../lib/dev-constants";
import { assignFinding } from "../services/findings.service";
import {
  assignIncident,
  createIncident,
} from "../services/incidents.service";
import { confirmInvestigation } from "../services/investigations/investigation.service";

const prisma = new PrismaClient();

const TEST_ORG = "clyprodnotifyorg0000000001";
const OTHER_ORG = "clyprodnotifyotherorg00001";
const OWNER_U = "clyprodnotifyowner000000001";
const ADMIN_U = "clyprodnotifyadmin000000001";
const ANALYST_U = "clyprodnotifyanalyst0000001";
const ANALYST_B = "clyprodnotifyanalystb000001";
const VIEWER_U = "clyprodnotifyviewer00000001";
const OTHER_ADMIN = "clyprodnotifyotheradmin0001";

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
  await prisma.incidentActivity.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.incidentFinding.deleteMany({
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
  await prisma.investigationGroup.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.securityEvent.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.finding.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.asset.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.incident.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.client.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
}

async function seed() {
  await cleanup();
  await prisma.organization.create({
    data: { id: TEST_ORG, name: "Producer Org", slug: "producer-notify-org" },
  });
  await prisma.organization.create({
    data: {
      id: OTHER_ORG,
      name: "Producer Other",
      slug: "producer-notify-other",
    },
  });
  const users: Array<{
    id: string;
    organizationId: string;
    email: string;
    name: string;
    role: UserRole;
  }> = [
    {
      id: OWNER_U,
      organizationId: TEST_ORG,
      email: "owner@prod.notify",
      name: "Owner",
      role: "OWNER",
    },
    {
      id: ADMIN_U,
      organizationId: TEST_ORG,
      email: "admin@prod.notify",
      name: "Admin",
      role: "ADMIN",
    },
    {
      id: ANALYST_U,
      organizationId: TEST_ORG,
      email: "analyst@prod.notify",
      name: "Analyst",
      role: "ANALYST",
    },
    {
      id: ANALYST_B,
      organizationId: TEST_ORG,
      email: "analystb@prod.notify",
      name: "Analyst B",
      role: "ANALYST",
    },
    {
      id: VIEWER_U,
      organizationId: TEST_ORG,
      email: "viewer@prod.notify",
      name: "Viewer",
      role: "VIEWER",
    },
    {
      id: OTHER_ADMIN,
      organizationId: OTHER_ORG,
      email: "admin@other.prod",
      name: "Other",
      role: "ADMIN",
    },
  ];
  await prisma.user.createMany({ data: users });
  const client = await prisma.client.create({
    data: {
      organizationId: TEST_ORG,
      name: "Producer Client",
      slug: "producer-client",
      status: "ACTIVE",
    },
  });
  return { clientId: client.id };
}

async function main() {
  console.log("\n=== Phase 4b Notification Producers ===\n");
  const { clientId } = await seed();

  const harborMaps = await prisma.wazuhAgentMapping.count({
    where: {
      organizationId: DEV_ORG_ID,
      wazuhAgentId: { in: ["001", "002"] },
    },
  });
  assert(harborMaps === 2, "Harborline mappings unchanged");

  console.log("\n-- CRITICAL incident created --");
  const crit = await createIncident({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    data: {
      clientId,
      assetId: null,
      title: "Critical breach",
      description: "crit",
      severity: "CRITICAL",
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
  const critNotifs = await prisma.notification.findMany({
    where: {
      organizationId: TEST_ORG,
      dedupeKey: `incident:${crit.id}:critical-created`,
    },
    include: { recipients: true },
  });
  assert(critNotifs.length === 1, "CRITICAL Incident creation notification");
  const recipRoles = await prisma.user.findMany({
    where: {
      id: { in: critNotifs[0].recipients.map((r) => r.userId) },
    },
    select: { id: true, role: true },
  });
  assert(
    recipRoles.every((u) => u.role !== "VIEWER"),
    "VIEWER excluded from CRITICAL created"
  );
  assert(
    recipRoles.some((u) => u.role === "ANALYST") &&
      recipRoles.some((u) => u.role === "ADMIN") &&
      recipRoles.some((u) => u.role === "OWNER"),
    "ANALYST + ADMIN + OWNER receive CRITICAL created"
  );

  // Idempotent: calling create again isn't possible; re-run producer path via duplicate key
  const { notifyCriticalIncidentCreated } = await import(
    "../services/notifications/notification-producers.service"
  );
  const again = await notifyCriticalIncidentCreated({
    organizationId: TEST_ORG,
    incidentId: crit.id,
    title: "Critical breach",
    caseNumber: null,
    clientId,
    assetId: null,
  });
  assert(again.created === false, "CRITICAL-created dedupe on retry");

  console.log("\n-- non-CRITICAL does not create critical-created --");
  const high = await createIncident({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    data: {
      clientId,
      assetId: null,
      title: "High only",
      description: "high",
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
  const highCrit = await prisma.notification.count({
    where: {
      organizationId: TEST_ORG,
      dedupeKey: `incident:${high.id}:critical-created`,
    },
  });
  assert(highCrit === 0, "no CRITICAL-created notification for non-CRITICAL");

  console.log("\n-- Incident assignment + reassignment + self-assign --");
  await assignIncident({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    incidentId: high.id,
    data: { assignedToUserId: ANALYST_U },
  });
  const assign1 = await prisma.notification.findMany({
    where: {
      organizationId: TEST_ORG,
      type: "INCIDENT_ASSIGNED",
      sourceId: high.id,
    },
    include: { recipients: true },
  });
  assert(assign1.length === 1, "Incident assignment creates notification");
  assert(
    assign1[0].recipients.length === 1 &&
      assign1[0].recipients[0].userId === ANALYST_U,
    "Incident assignment recipient is new assignee only"
  );
  assert(assign1[0].severity === "INFO", "Assignment severity INFO");
  assert(
    assign1[0].dedupeKey === `incident:${high.id}:assigned:${ANALYST_U}:g1`,
    "Incident assignment generation g1"
  );

  await assignIncident({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    incidentId: high.id,
    data: { assignedToUserId: ANALYST_B },
  });
  const assign2 = await prisma.notification.findMany({
    where: {
      organizationId: TEST_ORG,
      type: "INCIDENT_ASSIGNED",
      sourceId: high.id,
    },
  });
  assert(assign2.length === 2, "reassignment creates new notification");
  assert(
    assign2.some(
      (n) => n.dedupeKey === `incident:${high.id}:assigned:${ANALYST_B}:g2`
    ),
    "reassignment uses generation g2"
  );

  // Self-assignment
  await assignIncident({
    organizationId: TEST_ORG,
    actorId: ANALYST_U,
    incidentId: high.id,
    data: { assignedToUserId: ANALYST_U },
  });
  const selfAssign = await prisma.notification.findFirst({
    where: {
      organizationId: TEST_ORG,
      dedupeKey: `incident:${high.id}:assigned:${ANALYST_U}:g3`,
    },
    include: { recipients: true },
  });
  assert(!!selfAssign, "self-assignment still notifies assignee");
  assert(
    selfAssign?.recipients[0]?.userId === ANALYST_U,
    "self-assignment recipient is assignee"
  );

  console.log("\n-- Finding assignment --");
  const asset = await prisma.asset.create({
    data: {
      organizationId: TEST_ORG,
      clientId,
      name: "Producer Asset",
      type: "SERVER",
      environment: "PRODUCTION",
      hostname: "producer.test.local",
    },
  });
  const finding = await prisma.finding.create({
    data: {
      organizationId: TEST_ORG,
      clientId,
      assetId: asset.id,
      source: "MANUAL",
      code: "TEST_FINDING",
      title: "Test finding",
      description: "finding",
      severity: "HIGH",
      status: "OPEN",
      firstDetectedAt: new Date(),
      lastDetectedAt: new Date(),
    },
  });
  await assignFinding({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    findingId: finding.id,
    data: { assignedToUserId: ANALYST_U, dueDate: null },
  });
  const fAssign = await prisma.notification.findFirst({
    where: {
      organizationId: TEST_ORG,
      type: "FINDING_ASSIGNED",
      sourceId: finding.id,
    },
    include: { recipients: true },
  });
  assert(!!fAssign, "Finding assignment notification");
  assert(
    fAssign?.recipients.length === 1 &&
      fAssign.recipients[0].userId === ANALYST_U,
    "Finding assignment recipient is new assignee only"
  );
  assert(
    fAssign?.dedupeKey === `finding:${finding.id}:assigned:${ANALYST_U}:g1`,
    "Finding assignment generation g1"
  );

  await assignFinding({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    findingId: finding.id,
    data: { assignedToUserId: ANALYST_B, dueDate: null },
  });
  const fRe = await prisma.notification.count({
    where: {
      organizationId: TEST_ORG,
      type: "FINDING_ASSIGNED",
      sourceId: finding.id,
    },
  });
  assert(fRe === 2, "Finding reassignment creates second notification");

  console.log("\n-- Investigation confirmation --");
  const se = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId,
      title: "SE for inv",
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      source: "WAZUH",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      correlationKey: `prod-inv-${Date.now()}`,
    },
  });
  const inv = await prisma.investigationGroup.create({
    data: {
      organizationId: TEST_ORG,
      clientId,
      title: "Confirm me",
      status: "OPEN",
      severity: "HIGH",
      createdByType: "ANALYST_CREATED",
      createdByUserId: ANALYST_B,
    },
  });
  await prisma.investigationGroupEvent.create({
    data: {
      organizationId: TEST_ORG,
      groupId: inv.id,
      securityEventId: se.id,
      addedByUserId: ANALYST_B,
    },
  });

  await confirmInvestigation({
    organizationId: TEST_ORG,
    actorId: ANALYST_U,
    groupId: inv.id,
  });
  const conf = await prisma.notification.findFirst({
    where: {
      organizationId: TEST_ORG,
      dedupeKey: `investigation:${inv.id}:confirmed`,
    },
    include: { recipients: true },
  });
  assert(!!conf, "Investigation confirmation notification");
  const confIds = conf!.recipients.map((r) => r.userId);
  assert(!confIds.includes(ANALYST_U), "confirming actor excluded");
  assert(confIds.includes(ADMIN_U), "ADMIN receives confirmation");
  assert(confIds.includes(OWNER_U), "OWNER receives confirmation");
  assert(confIds.includes(ANALYST_B), "investigation creator receives confirmation");
  assert(!confIds.includes(VIEWER_U), "VIEWER excluded from confirmation");

  const confAgain = await confirmInvestigation({
    organizationId: TEST_ORG,
    actorId: ADMIN_U,
    groupId: inv.id,
  }).catch(() => null);
  // Already confirmed — may throw; either way only one notification
  void confAgain;
  const confCount = await prisma.notification.count({
    where: {
      organizationId: TEST_ORG,
      dedupeKey: `investigation:${inv.id}:confirmed`,
    },
  });
  assert(confCount === 1, "investigation confirmed dedupe");

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
