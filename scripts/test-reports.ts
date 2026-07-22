/**
 * Security reporting tests (no real ZAP scan).
 * Covers tenant isolation, snapshot immutability, versioning, PDF/storage security.
 */
import { PrismaClient } from "@prisma/client";
import { DEV_ORG_ID, DEV_USER_ID } from "../lib/dev-constants";
import { hasMinimumRole } from "../lib/auth/permissions";
import { generateReportSchema } from "../lib/validations/reports";
import {
  archiveReport,
  generateSecurityPostureReport,
  getReportById,
  getReportPdfBuffer,
  getSnapshotFromReport,
} from "../services/reports/report.service";
import { buildSecurityPostureSnapshot } from "../services/reports/report-data.service";
import { renderSecurityPosturePdf } from "../services/reports/report-pdf.service";
import {
  assertSafeStorageKey,
  buildReportStorageKey,
  readReportPdf,
} from "../services/reports/report-storage.service";
import {
  sanitizeReportText,
  stripForbiddenKeys,
} from "../services/reports/report-security.service";
import type { AuthSession } from "../lib/auth/types";

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

function session(
  role: AuthSession["role"],
  orgId = DEV_ORG_ID
): AuthSession {
  return {
    userId: DEV_USER_ID,
    organizationId: orgId,
    role,
    email: "test@example.com",
    name: "Test",
    externalId: null,
  };
}

async function main() {
  console.log("Security reporting tests\n");

  // —— RBAC hierarchy ——
  assert(hasMinimumRole(session("ANALYST"), "ANALYST"), "ANALYST can generate");
  assert(
    !hasMinimumRole(session("VIEWER"), "ANALYST"),
    "VIEWER blocked from generate (role check)"
  );
  assert(hasMinimumRole(session("ADMIN"), "ADMIN"), "ADMIN can archive");
  assert(
    !hasMinimumRole(session("ANALYST"), "ADMIN"),
    "ANALYST blocked from archive (role check)"
  );
  assert(hasMinimumRole(session("VIEWER"), "VIEWER"), "VIEWER can view/download");

  // —— Period validation ——
  const badPeriod = generateReportSchema.safeParse({
    clientId: "cmrt3dwt30001ooynzb8d0n5d",
    title: "Test",
    reportingPeriodStart: "2026-06-01",
    reportingPeriodEnd: "2026-05-01",
  });
  assert(!badPeriod.success, "Invalid reporting period blocked by Zod");

  const goodPeriod = generateReportSchema.safeParse({
    clientId: "cmrt3dwt30001ooynzb8d0n5d",
    title: "Test",
    reportingPeriodStart: "2026-01-01",
    reportingPeriodEnd: "2026-12-31",
    reportType: "SECURITY_POSTURE",
  });
  assert(goodPeriod.success, "Valid reporting period accepted");

  // —— Sanitization ——
  const redacted = sanitizeReportText(
    "Authorization: Bearer secret-token-xyz Cookie: session=abc"
  );
  assert(
    !!redacted &&
      redacted.includes("[REDACTED]") &&
      !redacted.includes("secret-token-xyz"),
    "Sensitive data sanitization redacts tokens"
  );
  const stripped = stripForbiddenKeys({
    title: "ok",
    password: "x",
    cookie: "y",
    note: "safe",
  });
  assert(
    stripped.password === undefined &&
      stripped.cookie === undefined &&
      stripped.title === "ok",
    "Forbidden keys stripped from objects"
  );

  // —— Path traversal ——
  let traversalBlocked = false;
  try {
    assertSafeStorageKey("../../etc/passwd");
  } catch {
    traversalBlocked = true;
  }
  assert(traversalBlocked, "Path traversal impossible via storage key");

  let absBlocked = false;
  try {
    assertSafeStorageKey("/tmp/evil.pdf");
  } catch {
    absBlocked = true;
  }
  assert(absBlocked, "Absolute paths rejected");

  const safeKey = buildReportStorageKey({
    organizationId: DEV_ORG_ID,
    reportId: "cmreporttestid00000000001",
    version: 1,
  });
  assert(
    !safeKey.includes("..") && safeKey.includes(DEV_ORG_ID.replace(/[^a-zA-Z0-9_-]/g, "")),
    "Storage key built server-side without traversal"
  );

  // —— Fixture client/asset in DEV org ——
  const asset = await prisma.asset.findFirst({
    where: { organizationId: DEV_ORG_ID },
    include: { client: true },
  });
  if (!asset?.client) throw new Error("Need seeded asset with client");
  const client = asset.client;

  const OTHER_ORG = "org_other_report_test";
  await prisma.organization.upsert({
    where: { id: OTHER_ORG },
    create: { id: OTHER_ORG, name: "Other Report Org", slug: "other-report-test" },
    update: {},
  });

  const otherClient = await prisma.client.upsert({
    where: { organizationId_slug: { organizationId: OTHER_ORG, slug: "other-c" } },
    create: {
      organizationId: OTHER_ORG,
      name: "Other Client",
      slug: "other-c",
      status: "ACTIVE",
    },
    update: {},
  });

  // Isolated findings for label tests
  const stamp = Date.now();
  const openF = await prisma.finding.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: client.id,
      assetId: asset.id,
      source: "MANUAL",
      code: `RPT_OPEN_${stamp}`,
      title: "Open scanner observation test",
      severity: "HIGH",
      status: "OPEN",
      evidence: {
        confidence: "Medium",
        cookie: "should-not-appear",
        authorization: "Bearer leak",
      },
    },
  });
  const validatedF = await prisma.finding.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: client.id,
      assetId: asset.id,
      source: "MANUAL",
      code: `RPT_VAL_${stamp}`,
      title: "Validated finding test",
      severity: "MEDIUM",
      status: "VALIDATED",
      validatedAt: new Date(),
      validatedByUserId: DEV_USER_ID,
      description: "Validated description",
      remediationGuidance: "Fix it",
    },
  });
  const fpF = await prisma.finding.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: client.id,
      assetId: asset.id,
      source: "MANUAL",
      code: `RPT_FP_${stamp}`,
      title: "False positive test",
      severity: "LOW",
      status: "FALSE_POSITIVE",
      statusReason: "Not applicable",
    },
  });
  const arF = await prisma.finding.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: client.id,
      assetId: asset.id,
      source: "MANUAL",
      code: `RPT_AR_${stamp}`,
      title: "Accepted risk test",
      severity: "LOW",
      status: "ACCEPTED_RISK",
      statusReason: "Compensating control",
      acceptedRiskApprovedAt: new Date(),
      acceptedRiskApprovedByUserId: DEV_USER_ID,
    },
  });
  const resolvedF = await prisma.finding.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: client.id,
      assetId: asset.id,
      source: "MANUAL",
      code: `RPT_RES_${stamp}`,
      title: "Resolved finding test",
      severity: "HIGH",
      status: "RESOLVED",
      resolvedAt: new Date(),
    },
  });

  const periodStart = new Date("2020-01-01T00:00:00.000Z");
  const periodEnd = new Date("2099-12-31T23:59:59.999Z");

  // —— Snapshot labels ——
  const snap = await buildSecurityPostureSnapshot({
    organizationId: DEV_ORG_ID,
    clientId: client.id,
    title: "Label test snapshot",
    periodStart,
    periodEnd,
    version: 1,
  });

  assert(
    snap.openObservations.some((o) => o.title === openF.title),
    "OPEN findings labeled as scanner observations"
  );
  assert(
    snap.validatedFindings.some((v) => v.title === validatedF.title),
    "VALIDATED findings separated correctly"
  );
  assert(
    !snap.validatedFindings.some((v) => v.title === openF.title),
    "OPEN not in validated section"
  );
  assert(
    !snap.openObservations.some((o) => o.title === validatedF.title),
    "VALIDATED not in open observations"
  );
  assert(
    !snap.validatedFindings.some((v) => v.title === fpF.title) &&
      !snap.openObservations.some((o) => o.title === fpF.title),
    "FALSE_POSITIVE excluded from active finding sections"
  );
  assert(
    snap.acceptedRisks.some((r) => r.title === arF.title),
    "ACCEPTED_RISK section includes accepted risks"
  );
  assert(
    !snap.validatedFindings.some((v) => v.title === resolvedF.title) &&
      !snap.openObservations.some((o) => o.title === resolvedF.title),
    "RESOLVED handling excludes from active sections"
  );
  assert(
    snap.methodology.methods.length > 0 ||
      snap.methodology.methods[0]?.includes("No completed"),
    "Methodology present"
  );
  assert(
    snap.limitations.some((l) =>
      l.toLowerCase().includes("not a penetration test")
    ),
    "Limitations disclaimer present"
  );
  assert(
    snap.scoreTrend.every((h) => typeof h.score === "number"),
    "Score trend uses real snapshot fields only"
  );

  // Unassessed asset behavior — score null or coverage Not Assessed for assets without scores
  const unassessedOk = snap.assets.every(
    (a) => a.postureScore === null || typeof a.postureScore === "number"
  );
  assert(unassessedOk, "Unassessed asset behavior (null score allowed)");

  // —— PDF generation ——
  const pdf = await renderSecurityPosturePdf(snap);
  assert(pdf.length > 500 && pdf.subarray(0, 4).toString() === "%PDF", "PDF generated successfully");
  assert(pdf.length > 8000, "Multi-page professional PDF has substantial size");
  const pageObjects = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert(pageObjects >= 5, "PDF has multiple pages (cover + content)");
  assert(
    !snap.openObservations.some((o) =>
      /https?:\/\//i.test(o.title) && o.title.includes("?")
    ),
    "No raw FindingInstance URL explosion in Security Posture observations"
  );
  assert(
    snap.openObservations.every((o) => typeof o.instanceCount === "number"),
    "Observations use aggregated instance counts"
  );
  assert(!!snap.findingSummary.statusCounts, "Snapshot includes statusCounts for summary viz");
  assert(typeof snap.findingSummary.statusCounts?.resolved === "number", "Resolved count in statusCounts");
  assert(typeof snap.findingSummary.statusCounts?.falsePositives === "number", "FP count in statusCounts");

  // Empty validated findings still produces PDF
  const emptyValidated = {
    ...snap,
    validatedFindings: [],
    executiveSummary: {
      ...snap.executiveSummary,
      validatedBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    },
  };
  const pdfEmptyVal = await renderSecurityPosturePdf(emptyValidated);
  assert(
    pdfEmptyVal.subarray(0, 4).toString() === "%PDF",
    "Empty validated findings state still generates PDF"
  );

  // Insufficient trend
  const thinTrend = {
    ...snap,
    scoreTrend: snap.scoreTrend.slice(0, 1),
    scoreTrendInsufficient: true,
  };
  const pdfThin = await renderSecurityPosturePdf(thinTrend);
  assert(pdfThin.subarray(0, 4).toString() === "%PDF", "Score trend with insufficient data generates PDF");

  // Multi-snapshot trend
  if (snap.scoreTrend.length >= 2) {
    const pdfTrend = await renderSecurityPosturePdf({
      ...snap,
      scoreTrendInsufficient: false,
    });
    assert(pdfTrend.length > 5000, "Score trend with multiple snapshots generates PDF");
  }

  // Date formatting (GB style used in PDF helpers)
  const { fmtDate } = await import("../services/reports/pdf/primitives");
  assert(fmtDate("2004-12-22T00:00:00.000Z").includes("2004"), "Date formatting preserves year for past-due test data");
  assert(fmtDate(null) === "—", "Null date formatting");

  // —— Cross-org client generation blocked ——
  let crossClientBlocked = false;
  try {
    await generateSecurityPostureReport({
      organizationId: DEV_ORG_ID,
      actorId: DEV_USER_ID,
      clientId: otherClient.id,
      title: "Should fail",
      periodStart,
      periodEnd,
    });
  } catch {
    crossClientBlocked = true;
  }
  assert(crossClientBlocked, "Cross-org client report generation blocked");

  // —— Invalid period at service ——
  let badSvcPeriod = false;
  try {
    await generateSecurityPostureReport({
      organizationId: DEV_ORG_ID,
      actorId: DEV_USER_ID,
      clientId: client.id,
      title: "Bad period",
      periodStart: new Date("2026-12-01"),
      periodEnd: new Date("2026-01-01"),
    });
  } catch {
    badSvcPeriod = true;
  }
  assert(badSvcPeriod, "Invalid reporting period blocked at service");

  // —— Generate real report ——
  const r1 = await generateSecurityPostureReport({
    organizationId: DEV_ORG_ID,
    actorId: DEV_USER_ID,
    clientId: client.id,
    title: `Report Test vA ${stamp}`,
    periodStart,
    periodEnd,
  });
  const report1 = await getReportById(DEV_ORG_ID, r1.id);
  assert(report1?.status === "READY", "Report status READY after generation");
  assert(report1?.version === 1 || (report1?.version ?? 0) >= 1, "Report version set");
  assert(!!report1?.storageKey && !!report1?.generatedData, "Snapshot + storage key set");

  const storedSnap = getSnapshotFromReport(report1!);
  assert(!!storedSnap, "Snapshot readable from generatedData");
  const openCountAtGen = storedSnap!.executiveSummary.openObservations;

  // —— Immutability: mutate finding, old report unchanged ——
  await prisma.finding.update({
    where: { id: openF.id },
    data: { status: "VALIDATED", validatedAt: new Date(), validatedByUserId: DEV_USER_ID },
  });
  const reread = await getReportById(DEV_ORG_ID, r1.id);
  const snapAfter = getSnapshotFromReport(reread!);
  assert(
    snapAfter!.executiveSummary.openObservations === openCountAtGen,
    "Snapshot immutability — old report does not change after finding updates"
  );
  assert(
    snapAfter!.openObservations.some((o) => o.title === openF.title),
    "Old report still shows OPEN observation as of generation time"
  );

  // —— Version increment ——
  const r2 = await generateSecurityPostureReport({
    organizationId: DEV_ORG_ID,
    actorId: DEV_USER_ID,
    clientId: client.id,
    title: `Report Test vB ${stamp}`,
    periodStart,
    periodEnd,
  });
  const report2 = await getReportById(DEV_ORG_ID, r2.id);
  assert(
    (report2?.version ?? 0) === (report1?.version ?? 0) + 1,
    "Report version increment"
  );
  assert(report2?.id !== report1?.id, "New report row created (no overwrite)");

  // —— Download authorization / tenant isolation ——
  let crossDownloadBlocked = false;
  try {
    await getReportPdfBuffer({
      organizationId: OTHER_ORG,
      actorId: DEV_USER_ID,
      reportId: r1.id,
    });
  } catch {
    crossDownloadBlocked = true;
  }
  assert(crossDownloadBlocked, "Cross-org report access blocked");

  const download = await getReportPdfBuffer({
    organizationId: DEV_ORG_ID,
    actorId: DEV_USER_ID,
    reportId: r1.id,
  });
  assert(
    download.buffer.length > 500 &&
      download.buffer.subarray(0, 4).toString() === "%PDF",
    "Download authorization succeeds for owning org"
  );

  // PDF storage protected — read only via resolved key
  const fromDisk = await readReportPdf(report1!.storageKey!);
  assert(fromDisk.equals(download.buffer), "PDF storage protected and readable via key");

  // —— Cross-org getReportById ——
  const leak = await getReportById(OTHER_ORG, r1.id);
  assert(leak === null, "Tenant isolation — getReportById returns null cross-org");

  // —— Archive ——
  await archiveReport({
    organizationId: DEV_ORG_ID,
    actorId: DEV_USER_ID,
    reportId: r1.id,
  });
  const archived = await getReportById(DEV_ORG_ID, r1.id);
  assert(archived?.status === "ARCHIVED", "Report archived");

  // Asset/client score snapshot accuracy — posture fields present
  assert(
    storedSnap!.executiveSummary.posture !== undefined &&
      typeof storedSnap!.executiveSummary.posture.assetsTotal === "number",
    "Asset/client score snapshot accuracy fields present"
  );

  // Cleanup test findings (keep reports for inspection or delete)
  await prisma.finding.deleteMany({
    where: {
      id: { in: [openF.id, validatedF.id, fpF.id, arF.id, resolvedF.id] },
    },
  });
  await prisma.report.deleteMany({
    where: { id: { in: [r1.id, r2.id] } },
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
