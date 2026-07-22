/**
 * Analyst triage workflow tests (no real ZAP scan).
 */
import { PrismaClient } from "@prisma/client";
import { DEV_ORG_ID, DEV_USER_ID } from "../lib/dev-constants";
import { assertFindingTransition } from "../services/findings/status-transitions";
import {
  assignFinding,
  updateFindingStatus,
} from "../services/findings.service";
import { assignFindingSchema } from "../lib/validations/findings";

const prisma = new PrismaClient();
let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  PASS: ${msg}`);
    passed += 1;
  } else {
    console.log(`  FAIL: ${msg}`);
    failed += 1;
  }
}

async function main() {
  console.log("Triage workflow tests\n");

  // Transition matrix
  try {
    assertFindingTransition("OPEN", "VALIDATED");
    assert(true, "OPEN → VALIDATED allowed");
  } catch {
    assert(false, "OPEN → VALIDATED allowed");
  }
  try {
    assertFindingTransition("OPEN", "IN_PROGRESS");
    assert(false, "OPEN → IN_PROGRESS blocked");
  } catch {
    assert(true, "OPEN → IN_PROGRESS blocked");
  }
  try {
    assertFindingTransition("VALIDATED", "RESOLVED");
    assert(false, "VALIDATED → RESOLVED blocked");
  } catch {
    assert(true, "VALIDATED → RESOLVED blocked");
  }

  const past = assignFindingSchema.safeParse({
    assignedToUserId: "",
    dueDate: "2004-12-22",
  });
  assert(!past.success, "Past due date rejected by Zod");

  const future = assignFindingSchema.safeParse({
    assignedToUserId: "",
    dueDate: "2099-01-01",
  });
  assert(future.success, "Future due date accepted by Zod");

  const asset = await prisma.asset.findFirst({
    where: { organizationId: DEV_ORG_ID },
  });
  if (!asset) throw new Error("Need seeded asset");

  const finding = await prisma.finding.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: asset.clientId,
      assetId: asset.id,
      source: "MANUAL",
      code: `TRIAGE_TEST_${Date.now()}`,
      title: "Triage test finding",
      severity: "MEDIUM",
      status: "OPEN",
    },
  });

  const OTHER_ORG = "org_other_triage_test";
  await prisma.organization.upsert({
    where: { id: OTHER_ORG },
    create: { id: OTHER_ORG, name: "Other", slug: "other-triage-test" },
    update: {},
  });

  let crossBlocked = false;
  try {
    await updateFindingStatus({
      organizationId: OTHER_ORG,
      actorId: DEV_USER_ID,
      findingId: finding.id,
      data: { status: "VALIDATED" },
      canAcceptRisk: false,
    });
  } catch {
    crossBlocked = true;
  }
  assert(crossBlocked, "Cross-org mutation blocked");

  const validated = await updateFindingStatus({
    organizationId: DEV_ORG_ID,
    actorId: DEV_USER_ID,
    findingId: finding.id,
    data: { status: "VALIDATED", validationNotes: "Confirmed applicable" },
    canAcceptRisk: false,
  });
  assert(validated.status === "VALIDATED", "OPEN → VALIDATED");
  assert(validated.validatedAt != null, "validatedAt set");
  assert(validated.validatedByUserId === DEV_USER_ID, "validatedBy set");

  let fpNoReason = false;
  try {
    await updateFindingStatus({
      organizationId: DEV_ORG_ID,
      actorId: DEV_USER_ID,
      findingId: finding.id,
      data: { status: "FALSE_POSITIVE" },
      canAcceptRisk: false,
    });
  } catch {
    fpNoReason = true;
  }
  assert(fpNoReason, "FALSE_POSITIVE requires reason");

  const inProg = await updateFindingStatus({
    organizationId: DEV_ORG_ID,
    actorId: DEV_USER_ID,
    findingId: finding.id,
    data: { status: "IN_PROGRESS" },
    canAcceptRisk: false,
  });
  assert(inProg.status === "IN_PROGRESS", "VALIDATED → IN_PROGRESS");

  const resolved = await updateFindingStatus({
    organizationId: DEV_ORG_ID,
    actorId: DEV_USER_ID,
    findingId: finding.id,
    data: { status: "RESOLVED", reason: "Fixed and verified manually" },
    canAcceptRisk: false,
  });
  assert(resolved.status === "RESOLVED", "IN_PROGRESS → RESOLVED");

  // Fresh finding for accepted risk RBAC
  const arFinding = await prisma.finding.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: asset.clientId,
      assetId: asset.id,
      source: "OWASP_ZAP",
      code: `TRIAGE_AR_${Date.now()}`,
      title: "AR test",
      severity: "LOW",
      status: "OPEN",
    },
  });

  let arBlocked = false;
  try {
    await updateFindingStatus({
      organizationId: DEV_ORG_ID,
      actorId: DEV_USER_ID,
      findingId: arFinding.id,
      data: { status: "ACCEPTED_RISK", reason: "Business accepts" },
      canAcceptRisk: false,
    });
  } catch (e) {
    arBlocked = e instanceof Error && /ADMIN|OWNER/i.test(e.message);
  }
  assert(arBlocked, "ACCEPTED_RISK blocked without ADMIN");

  const accepted = await updateFindingStatus({
    organizationId: DEV_ORG_ID,
    actorId: DEV_USER_ID,
    findingId: arFinding.id,
    data: {
      status: "ACCEPTED_RISK",
      reason: "Business accepts residual risk",
      acceptedRiskReviewDate: "2099-06-01T00:00:00.000Z",
    },
    canAcceptRisk: true,
  });
  assert(accepted.status === "ACCEPTED_RISK", "ADMIN can accept risk");
  assert(accepted.acceptedRiskApprovedAt != null, "approval timestamp set");

  let pastDueBlocked = false;
  try {
    await assignFinding({
      organizationId: DEV_ORG_ID,
      actorId: DEV_USER_ID,
      findingId: finding.id,
      data: { assignedToUserId: null, dueDate: "2004-12-22" },
    });
  } catch (e) {
    pastDueBlocked =
      e instanceof Error && /past/i.test(e.message);
  }
  assert(pastDueBlocked, "Server rejects past due date on assign");

  await prisma.finding.deleteMany({
    where: { id: { in: [finding.id, arFinding.id] } },
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
