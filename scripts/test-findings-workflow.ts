/**
 * Findings + remediation workflow tests.
 * Run with: npx tsx scripts/test-findings-workflow.ts
 */
import { PrismaClient } from "@prisma/client";
import { updateFindingStatusSchema } from "../lib/validations/findings";
import { DEV_ORG_ID, DEV_USER_ID } from "../lib/dev-constants";
import {
  assignFinding,
  countUnresolvedBySeverity,
  getFindingById,
  getFindingSummary,
  updateFindingStatus,
} from "../services/findings.service";
import {
  createRemediationTask,
  getRemediationTaskById,
  updateRemediationTask,
} from "../services/remediation.service";
import {
  buildPassiveFindings,
  syncPassiveFindings,
} from "../services/security-checks/findings.service";
import type { SecurityCheckSummary } from "../types/security-check";

const prisma = new PrismaClient();
const OTHER_ORG_ID = "clyfakeorg00000000000001";
const OTHER_USER_ID = "clyfakeuser000000000001";

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

function emptySummary(overrides: Partial<SecurityCheckSummary> = {}): SecurityCheckSummary {
  return {
    https: {
      reachable: true,
      finalUrl: "https://example.test",
      statusCode: 200,
      responseTimeMs: 100,
      httpRedirectsToHttps: true,
      error: null,
    },
    tls: {
      status: "VALID",
      validFrom: new Date().toISOString(),
      validTo: new Date(Date.now() + 90 * 86400000).toISOString(),
      daysUntilExpiration: 90,
      issuer: "Test",
      subject: "example.test",
      currentlyValid: true,
      hostnameValid: true,
      error: null,
    },
    headers: {
      items: [
        {
          name: "Strict-Transport-Security",
          status: "MISSING",
          valuePresent: false,
          explanation: "HSTS not present",
        },
      ],
      presentCount: 0,
      missingCount: 1,
    },
    cookies: {
      cookiesObserved: 0,
      allSecure: null,
      allHttpOnly: null,
      allSameSite: null,
      observations: [],
      summary: "No cookies observed",
    },
    scoreBreakdown: {
      https: 25,
      tls: 25,
      headers: 10,
      cookies: 10,
      total: 70,
    },
    posture: {
      https: "Good",
      tls: "Good",
      headers: "Needs Attention",
      cookies: "Not Applicable",
    },
    ...overrides,
  };
}

async function main() {
  console.log("Findings / Remediation workflow tests\n");

  // Validation: reason required
  const fpNoReason = updateFindingStatusSchema.safeParse({
    status: "FALSE_POSITIVE",
  });
  assert(!fpNoReason.success, "False Positive requires reason");

  const arNoReason = updateFindingStatusSchema.safeParse({
    status: "ACCEPTED_RISK",
  });
  assert(!arNoReason.success, "Accepted Risk requires reason");

  const fpOk = updateFindingStatusSchema.safeParse({
    status: "FALSE_POSITIVE",
    reason: "Benign observation",
  });
  assert(fpOk.success, "False Positive with reason accepted");

  // Seed fixtures
  const otherOrg = await prisma.organization.upsert({
    where: { id: OTHER_ORG_ID },
    update: {},
    create: {
      id: OTHER_ORG_ID,
      name: "Other Org Isolation",
      slug: "other-org-isolation",
    },
  });

  await prisma.user.upsert({
    where: { id: OTHER_USER_ID },
    update: {},
    create: {
      id: OTHER_USER_ID,
      organizationId: otherOrg.id,
      email: "other@example.test",
      name: "Other User",
      role: "ANALYST",
    },
  });

  const seedAsset = await prisma.asset.findFirst({
    where: { organizationId: DEV_ORG_ID },
    select: { id: true, clientId: true },
  });
  if (!seedAsset) {
    throw new Error("No asset found. Run db:seed first.");
  }

  // Isolated asset so terminal statuses on seed data cannot block sync tests
  const asset = await prisma.asset.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: seedAsset.clientId,
      name: `Findings Workflow Test ${Date.now()}`,
      type: "WEBSITE",
      url: "https://findings-workflow-test.example.com",
      criticality: "MEDIUM",
      authorizationStatus: "AUTHORIZED",
      monitoringStatus: "ACTIVE",
    },
  });

  const scan = await prisma.scan.create({
    data: {
      organizationId: DEV_ORG_ID,
      assetId: asset.id,
      scanType: "PASSIVE_WEBSITE",
      status: "COMPLETED",
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  // Dedup + sync
  const summary = emptySummary();
  const drafts = buildPassiveFindings(summary);
  assert(
    drafts.some((d) => d.code === "HSTS_MISSING"),
    "Passive builder emits HSTS_MISSING"
  );

  await syncPassiveFindings({
    organizationId: DEV_ORG_ID,
    assetId: asset.id,
    scanId: scan.id,
    summary,
    actorId: DEV_USER_ID,
  });

  const first = await prisma.finding.findMany({
    where: {
      organizationId: DEV_ORG_ID,
      assetId: asset.id,
      code: "HSTS_MISSING",
      status: { in: ["OPEN", "VALIDATED", "IN_PROGRESS"] },
    },
  });
  assert(first.length === 1, "Finding deduplication creates single open finding");

  const findingId = first[0]!.id;
  const beforeLast = first[0]!.lastDetectedAt;

  await new Promise((r) => setTimeout(r, 20));

  await syncPassiveFindings({
    organizationId: DEV_ORG_ID,
    assetId: asset.id,
    scanId: scan.id,
    summary,
    actorId: DEV_USER_ID,
  });

  const afterDedupe = await prisma.finding.findMany({
    where: {
      organizationId: DEV_ORG_ID,
      assetId: asset.id,
      code: "HSTS_MISSING",
    },
  });
  assert(afterDedupe.length === 1, "Second sync does not create duplicate");
  assert(
    afterDedupe[0]!.lastDetectedAt.getTime() >= beforeLast.getTime(),
    "lastDetectedAt updated on recurrence sync"
  );

  // Tenant isolation
  const cross = await getFindingById(OTHER_ORG_ID, findingId);
  assert(cross === null, "Cross-org finding access blocked");

  let assignBlocked = false;
  try {
    await assignFinding({
      organizationId: DEV_ORG_ID,
      actorId: DEV_USER_ID,
      findingId,
      data: { assignedToUserId: OTHER_USER_ID, dueDate: null },
    });
  } catch {
    assignBlocked = true;
  }
  assert(assignBlocked, "Cross-org user assignment blocked");

  // Status lifecycle + accepted risk not auto-resolved
  await updateFindingStatus({
    organizationId: DEV_ORG_ID,
    actorId: DEV_USER_ID,
    findingId,
    data: { status: "ACCEPTED_RISK", reason: "Business accepted residual risk" },
    canAcceptRisk: true,
  });

  const cleared = emptySummary({
    headers: {
      items: [
        {
          name: "Strict-Transport-Security",
          status: "PRESENT",
          valuePresent: true,
          explanation: "HSTS present",
        },
      ],
      presentCount: 1,
      missingCount: 0,
    },
  });

  await syncPassiveFindings({
    organizationId: DEV_ORG_ID,
    assetId: asset.id,
    scanId: scan.id,
    summary: cleared,
    actorId: DEV_USER_ID,
  });

  const accepted = await prisma.finding.findUnique({ where: { id: findingId } });
  assert(
    accepted?.status === "ACCEPTED_RISK",
    "Accepted Risk not auto-resolved when issue clears"
  );

  // False positive behavior
  const fpFinding = await prisma.finding.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: asset.clientId,
      assetId: asset.id,
      scanId: scan.id,
      source: "PASSIVE_CHECK",
      code: "CSP_MISSING",
      title: "CSP missing",
      description: "test",
      severity: "MEDIUM",
      status: "FALSE_POSITIVE",
      statusReason: "Not applicable",
      firstDetectedAt: new Date(),
      lastDetectedAt: new Date(),
    },
  });

  await syncPassiveFindings({
    organizationId: DEV_ORG_ID,
    assetId: asset.id,
    scanId: scan.id,
    summary: cleared,
    actorId: DEV_USER_ID,
  });

  const fpAfter = await prisma.finding.findUnique({ where: { id: fpFinding.id } });
  assert(
    fpAfter?.status === "FALSE_POSITIVE",
    "False Positive not auto-resolved"
  );

  // Resolution + reopen
  const resolveTarget = await prisma.finding.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: asset.clientId,
      assetId: asset.id,
      scanId: scan.id,
      source: "PASSIVE_CHECK",
      code: "REFERRER_POLICY_MISSING",
      title: "Referrer-Policy missing",
      description: "test",
      severity: "LOW",
      status: "OPEN",
      firstDetectedAt: new Date(),
      lastDetectedAt: new Date(),
    },
  });

  await syncPassiveFindings({
    organizationId: DEV_ORG_ID,
    assetId: asset.id,
    scanId: scan.id,
    summary: cleared,
    actorId: DEV_USER_ID,
  });

  const resolved = await prisma.finding.findUnique({
    where: { id: resolveTarget.id },
  });
  assert(resolved?.status === "RESOLVED", "Finding resolved when issue clears");
  assert(resolved?.resolvedAt != null, "resolvedAt set on auto-resolve");

  const withReferrerMissing = emptySummary({
    headers: {
      items: [
        {
          name: "Referrer-Policy",
          status: "MISSING",
          valuePresent: false,
          explanation: "missing",
        },
      ],
      presentCount: 0,
      missingCount: 1,
    },
  });

  await syncPassiveFindings({
    organizationId: DEV_ORG_ID,
    assetId: asset.id,
    scanId: scan.id,
    summary: withReferrerMissing,
    actorId: DEV_USER_ID,
  });

  const reopened = await prisma.finding.findUnique({
    where: { id: resolveTarget.id },
  });
  assert(reopened?.status === "OPEN", "Resolved finding reopened on recurrence");
  assert(reopened?.resolvedAt == null, "resolvedAt cleared on reopen");

  // Remediation lifecycle + overdue
  // First validate so create doesn't require confirmUnvalidated
  await prisma.finding.update({
    where: { id: resolveTarget.id },
    data: { status: "VALIDATED" },
  });
  const task = await createRemediationTask({
    organizationId: DEV_ORG_ID,
    actorId: DEV_USER_ID,
    data: {
      findingId: resolveTarget.id,
      title: "Fix referrer policy",
      description: "",
      priority: "HIGH",
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      notes: "",
    },
  });
  // Force overdue for list assertions
  await prisma.remediationTask.update({
    where: { id: task.id },
    data: { dueDate: new Date(Date.now() - 86400000) },
  });

  const crossTask = await getRemediationTaskById(OTHER_ORG_ID, task.id);
  assert(crossTask === null, "Cross-org remediation access blocked");

  const listed = await prisma.remediationTask.findUnique({
    where: { id: task.id },
  });
  assert(
    listed != null &&
      listed.dueDate != null &&
      listed.dueDate.getTime() < Date.now() &&
      listed.status === "OPEN",
    "Overdue calculation: past dueDate with OPEN status"
  );

  await updateRemediationTask({
    organizationId: DEV_ORG_ID,
    actorId: DEV_USER_ID,
    taskId: task.id,
    data: { status: "COMPLETED" },
  });
  const completed = await prisma.remediationTask.findUnique({
    where: { id: task.id },
  });
  assert(completed?.status === "COMPLETED", "Remediation task completed");
  assert(completed?.completedAt != null, "completedAt set");

  // Dashboard counts
  const critical = await countUnresolvedBySeverity(DEV_ORG_ID, "CRITICAL");
  const high = await countUnresolvedBySeverity(DEV_ORG_ID, "HIGH");
  const summaryCards = await getFindingSummary(DEV_ORG_ID);
  assert(typeof critical === "number", "Dashboard critical count query works");
  assert(typeof high === "number", "Dashboard high count query works");
  assert(
    summaryCards.criticalOpen === critical,
    "Summary criticalOpen matches unresolved critical count"
  );

  // Cleanup test remediation task and isolated asset
  await prisma.remediationTask.delete({ where: { id: task.id } }).catch(() => {});
  await prisma.finding.deleteMany({ where: { assetId: asset.id } });
  await prisma.scan.deleteMany({ where: { assetId: asset.id } });
  await prisma.asset.delete({ where: { id: asset.id } }).catch(() => {});

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
