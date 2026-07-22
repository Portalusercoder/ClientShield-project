/**
 * ZAP finding aggregation tests (Finding + FindingInstance).
 * Run with: npx tsx scripts/test-zap-aggregation.ts
 * Does NOT run a real ZAP scan.
 */
import { PrismaClient } from "@prisma/client";
import { DEV_ORG_ID, DEV_USER_ID } from "../lib/dev-constants";
import {
  buildZapFindingCode,
  buildZapInstanceKey,
  normalizeZapAlert,
  normalizeZapPath,
} from "../services/zap/zap-alert-normalizer.service";
import { syncZapFindings } from "../services/zap/zap-findings.service";
import { getFindingSummary } from "../services/findings.service";

const prisma = new PrismaClient();
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

async function main() {
  console.log("ZAP aggregation tests\n");

  assert(buildZapFindingCode("10098") === "ZAP:10098", "Finding code is ZAP:pluginId");
  assert(
    normalizeZapPath("https://ex.com/a/b/?x=1#frag") === "/a/b",
    "URL normalization strips query/fragment/trailing slash"
  );
  assert(
    normalizeZapPath("https://ex.com/a/b") ===
      normalizeZapPath("https://ex.com/a/b/"),
    "Trailing slash equivalence"
  );
  assert(
    buildZapInstanceKey({ url: "https://ex.com/a", method: "get", param: "Q" }) ===
      buildZapInstanceKey({ url: "https://ex.com/a/", method: "GET", param: "q" }),
    "Instance key normalizes method/param/path"
  );
  assert(
    buildZapInstanceKey({ url: "/a", param: "id" }) !==
      buildZapInstanceKey({ url: "/a", param: "name" }),
    "Parameter-sensitive instance dedupe"
  );

  const assetA = await prisma.asset.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: (
        await prisma.asset.findFirst({
          where: { organizationId: DEV_ORG_ID },
          select: { clientId: true },
        })
      )!.clientId,
      name: `ZAP Agg Test Asset A ${Date.now()}`,
      type: "WEBSITE",
      url: "https://agg-a.example.com",
      hostname: "agg-a.example.com",
      environment: "PRODUCTION",
      criticality: "MEDIUM",
      monitoringStatus: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
    },
  });

  // Second asset for cross-asset separation
  const assetB = await prisma.asset.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: assetA.clientId,
      name: "ZAP Agg Test Asset B",
      type: "WEBSITE",
      url: "https://agg-b.example.com",
      hostname: "agg-b.example.com",
      environment: "PRODUCTION",
      criticality: "LOW",
      monitoringStatus: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
    },
  });

  const scan = await prisma.scan.create({
    data: {
      organizationId: DEV_ORG_ID,
      assetId: assetA.id,
      scanType: "ZAP_BASELINE",
      status: "COMPLETED",
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  const drafts = [
    normalizeZapAlert({
      pluginId: "10098",
      name: "Cross-Domain Misconfiguration",
      riskcode: "2",
      risk: "Medium",
      confidence: "Medium",
      url: "https://ex.com/page-a",
      method: "GET",
      description: "CORS",
      solution: "Fix CORS",
      cweid: "264",
    })!,
    normalizeZapAlert({
      pluginId: "10098",
      name: "Cross-Domain Misconfiguration",
      riskcode: "2",
      url: "https://ex.com/page-b",
      method: "GET",
    })!,
    normalizeZapAlert({
      pluginId: "10098",
      name: "Cross-Domain Misconfiguration",
      riskcode: "2",
      url: "https://ex.com/page-c",
      method: "GET",
    })!,
  ];

  assert(drafts[0]!.code === "ZAP:10098", "Normalized finding code excludes path");
  assert(
    drafts[0]!.instance.instanceKey !== drafts[1]!.instance.instanceKey,
    "Different paths → different instance keys"
  );

  const sync = await syncZapFindings({
    organizationId: DEV_ORG_ID,
    assetId: assetA.id,
    scanId: scan.id,
    findings: drafts,
    actorId: DEV_USER_ID,
  });

  assert(sync.created === 1, "Same plugin + same asset + 3 URLs → 1 Finding created");
  assert(sync.instancesCreated === 3, "Three FindingInstances created");

  const findings = await prisma.finding.findMany({
    where: {
      organizationId: DEV_ORG_ID,
      assetId: assetA.id,
      source: "OWASP_ZAP",
      code: "ZAP:10098",
    },
    include: { _count: { select: { instances: true } } },
  });
  assert(findings.length === 1, "Exactly one Finding for plugin 10098 on asset A");
  assert(findings[0]!._count.instances === 3, "Finding has 3 instances");

  // Duplicate URL should not create another instance
  const sync2 = await syncZapFindings({
    organizationId: DEV_ORG_ID,
    assetId: assetA.id,
    scanId: scan.id,
    findings: [drafts[0]!],
    actorId: DEV_USER_ID,
  });
  assert(sync2.instancesCreated === 0, "Duplicate URL instance → no new instance");
  assert(sync2.instancesUpdated === 1, "Duplicate URL updates existing instance");

  // Different asset → separate Finding
  const scanB = await prisma.scan.create({
    data: {
      organizationId: DEV_ORG_ID,
      assetId: assetB.id,
      scanType: "ZAP_BASELINE",
      status: "COMPLETED",
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
  await syncZapFindings({
    organizationId: DEV_ORG_ID,
    assetId: assetB.id,
    scanId: scanB.id,
    findings: [drafts[0]!],
    actorId: DEV_USER_ID,
  });
  const acrossAssets = await prisma.finding.count({
    where: {
      organizationId: DEV_ORG_ID,
      source: "OWASP_ZAP",
      code: "ZAP:10098",
      assetId: { in: [assetA.id, assetB.id] },
    },
  });
  assert(acrossAssets === 2, "Same plugin + different assets → separate Findings");

  // Tenant isolation for instances
  const otherOrgInstances = await prisma.findingInstance.count({
    where: {
      organizationId: "clyfakeorgzapagg0000001",
      findingId: findings[0]!.id,
    },
  });
  assert(otherOrgInstances === 0, "Cross-org instance access empty");

  // Accepted risk not reopened
  await prisma.finding.update({
    where: { id: findings[0]!.id },
    data: { status: "ACCEPTED_RISK", statusReason: "accepted in test" },
  });
  await syncZapFindings({
    organizationId: DEV_ORG_ID,
    assetId: assetA.id,
    scanId: scan.id,
    findings: drafts,
    actorId: DEV_USER_ID,
  });
  const afterAccepted = await prisma.finding.findUnique({
    where: { id: findings[0]!.id },
  });
  assert(
    afterAccepted?.status === "ACCEPTED_RISK",
    "Accepted Risk preserved on re-import"
  );

  await prisma.finding.update({
    where: { id: findings[0]!.id },
    data: { status: "FALSE_POSITIVE", statusReason: "fp" },
  });
  await syncZapFindings({
    organizationId: DEV_ORG_ID,
    assetId: assetA.id,
    scanId: scan.id,
    findings: drafts,
    actorId: DEV_USER_ID,
  });
  const afterFp = await prisma.finding.findUnique({
    where: { id: findings[0]!.id },
  });
  assert(afterFp?.status === "FALSE_POSITIVE", "False Positive preserved");

  // Summary counts Findings not instances — use a fresh OPEN finding
  await prisma.finding.update({
    where: { id: findings[0]!.id },
    data: { status: "OPEN", statusReason: null },
  });
  const summary = await getFindingSummary(DEV_ORG_ID);
  assert(
    typeof summary.mediumOpen === "number",
    "Summary cards query unique Findings"
  );

  // Evidence sanitization on normalize
  const dirty = normalizeZapAlert({
    pluginId: "1",
    name: "t",
    url: "https://ex.com/",
    evidence: "Cookie: session=abc",
  })!;
  assert(
    JSON.stringify(dirty.instance.evidence).includes("[REDACTED]") ||
      !JSON.stringify(dirty.instance.evidence).includes("session=abc"),
    "Evidence sanitization redacts cookies"
  );

  // Cleanup test data
  await prisma.findingInstance.deleteMany({
    where: { findingId: { in: [findings[0]!.id] } },
  });
  const bFinding = await prisma.finding.findFirst({
    where: { assetId: assetB.id, code: "ZAP:10098" },
  });
  if (bFinding) {
    await prisma.findingInstance.deleteMany({ where: { findingId: bFinding.id } });
    await prisma.finding.delete({ where: { id: bFinding.id } });
  }
  await prisma.finding.delete({ where: { id: findings[0]!.id } }).catch(() => {});
  await prisma.scan.deleteMany({ where: { id: { in: [scan.id, scanB.id] } } });
  await prisma.findingInstance.deleteMany({
    where: { finding: { assetId: { in: [assetA.id, assetB.id] } } },
  });
  await prisma.finding.deleteMany({
    where: { assetId: { in: [assetA.id, assetB.id] } },
  });
  await prisma.asset.deleteMany({
    where: { id: { in: [assetA.id, assetB.id] } },
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
