/**
 * Derived SOC attention queue tests.
 * Isolated TEST orgs — does not mutate Harborline / Agents 000–002.
 * Run: npm run test:attention
 */
import { PrismaClient } from "@prisma/client";
import {
  listAttentionItems,
  getAttentionSummary,
} from "../services/attention/attention.service";
import { DEV_ORG_ID } from "../lib/dev-constants";

const prisma = new PrismaClient();

const TEST_ORG = "clyattentiontestorg0000001";
const OTHER_ORG = "clyattentionotherorg000001";
const TEST_USER = "clyattentiontestuser000001";
const OTHER_USER = "clyattentionotheruser0001";

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
  await prisma.investigationGroupIncident.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.investigationGroupEvent.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.investigationActivity.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.correlationCandidate.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.incidentSecurityEvent.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.incidentFinding.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.incidentActivity.deleteMany({
    where: { organizationId: { in: orgs } },
  });
  await prisma.securityEventActivity.deleteMany({
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
    where: { id: { in: [TEST_USER, OTHER_USER] } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: orgs } },
  });
}

async function main() {
  console.log("\n=== Attention queue tests ===\n");
  await cleanup();

  await prisma.organization.create({
    data: { id: TEST_ORG, name: "Attention Test Org", slug: "attention-test" },
  });
  await prisma.organization.create({
    data: { id: OTHER_ORG, name: "Attention Other Org", slug: "attention-other" },
  });
  await prisma.user.create({
    data: {
      id: TEST_USER,
      organizationId: TEST_ORG,
      email: "attention@test.local",
      name: "Attention Analyst",
      role: "ANALYST",
    },
  });
  await prisma.user.create({
    data: {
      id: OTHER_USER,
      organizationId: OTHER_ORG,
      email: "attention-other@test.local",
      name: "Other Analyst",
      role: "ANALYST",
    },
  });

  const clientA = await prisma.client.create({
    data: {
      organizationId: TEST_ORG,
      name: "Attention Client A",
      slug: "attention-client-a",
      status: "ACTIVE",
    },
  });
  const clientB = await prisma.client.create({
    data: {
      organizationId: TEST_ORG,
      name: "Attention Client B",
      slug: "attention-client-b",
      status: "ACTIVE",
    },
  });
  const assetA1 = await prisma.asset.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      name: "Asset A1",
      type: "SERVER",
      environment: "PRODUCTION",
      criticality: "HIGH",
      monitoringStatus: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
    },
  });
  const assetA2 = await prisma.asset.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      name: "Asset A2",
      type: "WORKSTATION",
      environment: "PRODUCTION",
      criticality: "MEDIUM",
      monitoringStatus: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
    },
  });
  const assetB = await prisma.asset.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientB.id,
      name: "Asset B1",
      type: "SERVER",
      environment: "PRODUCTION",
      criticality: "HIGH",
      monitoringStatus: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
    },
  });

  const now = new Date();
  const older = new Date(now.getTime() - 60 * 60_000);

  const seHighA = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      assetId: assetA1.id,
      source: "WAZUH",
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      title: "SE High Client A",
      firstSeenAt: older,
      lastSeenAt: older,
      correlationKey: `attn-se-a-${Date.now()}`,
    },
  });
  const seCritA2 = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      assetId: assetA2.id,
      source: "WAZUH",
      severity: "CRITICAL",
      status: "REVIEWING",
      classification: "ACTIONABLE",
      title: "SE Critical Client A asset2",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `attn-se-a2-${Date.now()}`,
    },
  });
  const seB = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientB.id,
      assetId: assetB.id,
      source: "WAZUH",
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      title: "SE High Client B",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `attn-se-b-${Date.now()}`,
    },
  });
  const seNull = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: null,
      assetId: null,
      source: "WAZUH",
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      title: "SE Unattributed",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `attn-se-null-${Date.now()}`,
      agentId: "000",
    },
  });
  const seNoisy = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      assetId: assetA1.id,
      source: "WAZUH",
      severity: "HIGH",
      status: "NEW",
      classification: "NOISY",
      title: "SE Noisy",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `attn-se-noisy-${Date.now()}`,
    },
  });
  const seIgnored = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      assetId: assetA1.id,
      source: "WAZUH",
      severity: "CRITICAL",
      status: "NEW",
      classification: "IGNORED",
      title: "SE Ignored",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `attn-se-ignored-${Date.now()}`,
    },
  });
  const seInfo = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      assetId: assetA1.id,
      source: "WAZUH",
      severity: "HIGH",
      status: "NEW",
      classification: "INFORMATIONAL",
      title: "SE Informational",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `attn-se-info-${Date.now()}`,
    },
  });
  const seDismissed = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      assetId: assetA1.id,
      source: "WAZUH",
      severity: "HIGH",
      status: "DISMISSED",
      classification: "ACTIONABLE",
      title: "SE Dismissed",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `attn-se-dismissed-${Date.now()}`,
    },
  });
  const seOtherOrg = await prisma.securityEvent.create({
    data: {
      organizationId: OTHER_ORG,
      source: "WAZUH",
      severity: "CRITICAL",
      status: "NEW",
      classification: "ACTIONABLE",
      title: "SE Other Org",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `attn-se-other-${Date.now()}`,
    },
  });

  const findingOpen = await prisma.finding.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      assetId: assetA1.id,
      title: "Finding High Open",
      severity: "HIGH",
      status: "OPEN",
      source: "PASSIVE_CHECK",
      code: `ATTN-F-OPEN-${Date.now()}`,
      firstDetectedAt: older,
      lastDetectedAt: older,
    },
  });
  const findingOverdue = await prisma.finding.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      assetId: assetA1.id,
      title: "Finding Critical Overdue",
      severity: "CRITICAL",
      status: "IN_PROGRESS",
      source: "PASSIVE_CHECK",
      code: `ATTN-F-OVERDUE-${Date.now()}`,
      dueDate: new Date(Date.now() - 86_400_000),
      firstDetectedAt: older,
      lastDetectedAt: older,
    },
  });
  const findingResolved = await prisma.finding.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      assetId: assetA1.id,
      title: "Finding Resolved",
      severity: "CRITICAL",
      status: "RESOLVED",
      source: "PASSIVE_CHECK",
      code: `ATTN-F-RES-${Date.now()}`,
      resolvedAt: now,
      firstDetectedAt: older,
      lastDetectedAt: older,
    },
  });

  const invOpen = await prisma.investigationGroup.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      assetId: assetA1.id,
      title: "Investigation High Open",
      severity: "HIGH",
      status: "OPEN",
      createdByType: "SYSTEM_SUGGESTED",
      groupingExplanation: "test",
    },
  });
  const invLinked = await prisma.investigationGroup.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      assetId: assetA1.id,
      title: "Investigation Linked",
      severity: "CRITICAL",
      status: "LINKED_TO_INCIDENT",
      createdByType: "ANALYST_CREATED",
      groupingExplanation: "test",
    },
  });
  const invDismissed = await prisma.investigationGroup.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      title: "Investigation Dismissed",
      severity: "CRITICAL",
      status: "DISMISSED",
      createdByType: "ANALYST_CREATED",
      groupingExplanation: "test",
      dismissedAt: now,
      dismissReason: "test",
    },
  });

  const incidentOpen = await prisma.incident.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      assetId: assetA1.id,
      caseNumber: `INC-ATTN-${Date.now()}-1`,
      title: "Incident High Open",
      severity: "HIGH",
      status: "OPEN",
      category: "OTHER",
      source: "MANUAL",
      detectionMethod: "MANUAL",
      detectedAt: older,
      createdByUserId: TEST_USER,
    },
  });
  const incidentClosed = await prisma.incident.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientA.id,
      caseNumber: `INC-ATTN-${Date.now()}-2`,
      title: "Incident Closed",
      severity: "CRITICAL",
      status: "CLOSED",
      category: "OTHER",
      source: "MANUAL",
      detectionMethod: "MANUAL",
      detectedAt: older,
      closedAt: now,
      createdByUserId: TEST_USER,
    },
  });

  console.log("Isolation & attribution");
  const all = await listAttentionItems(TEST_ORG, { pageSize: 100 });
  const keys = new Set(all.items.map((i) => i.key));
  assert(
    !all.items.some((i) => i.sourceId === seOtherOrg.id),
    "1. Cross-org records never appear"
  );
  assert(
    all.items.every((i) => i.organizationId === TEST_ORG),
    "1b. All items scoped to TEST_ORG"
  );

  const clientAOnly = await listAttentionItems(TEST_ORG, {
    clientId: clientA.id,
    pageSize: 100,
  });
  assert(
    clientAOnly.items.every((i) => i.clientId === clientA.id),
    "2. Client A filter only returns Client A"
  );
  assert(
    !clientAOnly.items.some((i) => i.sourceId === seB.id),
    "2b. Client A filter excludes Client B"
  );
  assert(
    !clientAOnly.items.some((i) => i.clientId === null),
    "3. Client A filter excludes null-client events"
  );

  const unattr = await listAttentionItems(TEST_ORG, {
    attribution: "UNATTRIBUTED",
    pageSize: 100,
  });
  const nullItem = unattr.items.find((i) => i.sourceId === seNull.id);
  assert(Boolean(nullItem), "4. Null-client SE included in Unattributed filter");
  assert(
    Boolean(nullItem?.isUnattributed) && nullItem?.clientName == null,
    "4b. Null-client SE marked Unattributed (no inferred client)"
  );

  console.log("\nSecurityEvent eligibility");
  assert(keys.has(`SECURITY_EVENT:${seHighA.id}`), "5. ACTIONABLE HIGH NEW included");
  assert(
    keys.has(`SECURITY_EVENT:${seCritA2.id}`),
    "5b. ACTIONABLE CRITICAL REVIEWING included"
  );
  assert(!keys.has(`SECURITY_EVENT:${seNoisy.id}`), "6. NOISY excluded");
  assert(!keys.has(`SECURITY_EVENT:${seIgnored.id}`), "7. IGNORED excluded");
  assert(!keys.has(`SECURITY_EVENT:${seInfo.id}`), "8. INFORMATIONAL excluded");
  assert(!keys.has(`SECURITY_EVENT:${seDismissed.id}`), "9. Dismissed SE excluded");

  console.log("\nFinding eligibility");
  assert(keys.has(`FINDING:${findingOpen.id}`), "10. HIGH unresolved Finding included");
  assert(
    !keys.has(`FINDING:${findingResolved.id}`),
    "11. Resolved Finding excluded"
  );
  const overdueItem = all.items.find((i) => i.sourceId === findingOverdue.id);
  assert(Boolean(overdueItem), "12. Overdue Finding included");
  assert(overdueItem?.overdue === true, "12b. overdue=true");
  assert(
    Boolean(
      overdueItem?.reasons.includes("Overdue") &&
        overdueItem?.reasons.includes("Due date exceeded")
    ),
    "12c. Overdue reasons present (not SLA breached)"
  );
  assert(
    !overdueItem?.reasons.some((r) => /SLA breached|SLA violation/i.test(r)),
    "12d. No SLA breached/violation labeling"
  );

  console.log("\nInvestigation & Incident");
  assert(
    keys.has(`INVESTIGATION:${invOpen.id}`),
    "13. HIGH eligible Investigation included"
  );
  assert(
    !keys.has(`INVESTIGATION:${invDismissed.id}`),
    "14. DISMISSED Investigation excluded"
  );
  assert(
    !keys.has(`INVESTIGATION:${invLinked.id}`),
    "15. LINKED_TO_INCIDENT suppressed"
  );
  assert(keys.has(`INCIDENT:${incidentOpen.id}`), "16. HIGH active Incident included");
  assert(
    !keys.has(`INCIDENT:${incidentClosed.id}`),
    "17. CLOSED Incident excluded"
  );

  console.log("\nDedup, ordering, multi-asset");
  const seKeys = all.items.filter((i) => i.sourceType === "SECURITY_EVENT");
  const uniqueSe = new Set(seKeys.map((i) => i.sourceId));
  assert(seKeys.length === uniqueSe.size, "18. One item per source record");

  const summary = await getAttentionSummary(TEST_ORG);
  assert(summary.total === all.total, "18b. Summary uses same eligibility");

  // Ordering: overdue first, then CRITICAL before HIGH among non-overdue
  const sorted = [...all.items];
  let orderOk = true;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    if (a.overdue && !b.overdue) continue;
    if (!a.overdue && b.overdue) {
      orderOk = false;
      break;
    }
    if (a.overdue === b.overdue && a.severityRank < b.severityRank) {
      orderOk = false;
      break;
    }
  }
  assert(orderOk, "19. Deterministic priority ordering (overdue → severity)");

  const multiAsset = clientAOnly.items.filter(
    (i) =>
      i.sourceId === seHighA.id || i.sourceId === seCritA2.id
  );
  assert(
    multiAsset.every((i) => i.clientId === clientA.id) &&
      multiAsset.some((i) => i.assetId === assetA1.id) &&
      multiAsset.some((i) => i.assetId === assetA2.id),
    "20. Same-client multi-asset records correctly attributed"
  );

  // Read-only: Harborline / Agent mappings untouched
  const harborline = await prisma.client.findFirst({
    where: { organizationId: DEV_ORG_ID, name: { contains: "Harborline" } },
  });
  const map001 = await prisma.wazuhAgentMapping.findFirst({
    where: { organizationId: DEV_ORG_ID, wazuhAgentId: "001", status: "ACTIVE" },
  });
  const map002 = await prisma.wazuhAgentMapping.findFirst({
    where: { organizationId: DEV_ORG_ID, wazuhAgentId: "002", status: "ACTIVE" },
  });
  assert(
    harborline?.id === "cmrt0apf80003oowne38x239h" &&
      map001?.id === "cmrukm86a0001oo39v7qnshzn" &&
      map002?.id === "cmrw2lm5u0003ooqefdczjjek",
    "21. Existing Harborline/Ubuntu attribution not modified"
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
