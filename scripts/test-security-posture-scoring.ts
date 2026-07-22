/**
 * ClientShield Security Posture Score tests (fixtures — no real ZAP scan).
 */
import { PrismaClient } from "@prisma/client";
import { DEV_ORG_ID, DEV_USER_ID } from "../lib/dev-constants";
import {
  computeFindingDeduction,
} from "../services/scoring/asset-security-score.service";
import {
  calculateAssetSecurityPosture,
  recalculateAndPersistAssetScore,
} from "../services/scoring/asset-security-score.service";
import { calculateClientSecurityPosture } from "../services/scoring/client-security-score.service";
import { calculateOrganizationSecurityPosture } from "../services/scoring/organization-security-score.service";
import { exposureModifier } from "../services/scoring/scoring.constants";
import {
  maybeCreateAssetScoreSnapshot,
  recalculateScoresForAsset,
} from "../services/scoring/score-snapshot.service";

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
  console.log("Security posture scoring tests\n");

  assert(exposureModifier(1) === 1.0, "1 instance → 1.0x");
  assert(exposureModifier(5) === 1.1, "2–10 → 1.1x");
  assert(exposureModifier(20) === 1.2, "11–50 → 1.2x");
  assert(exposureModifier(100) === 1.3, "51+ → 1.3x capped");

  assert(
    computeFindingDeduction({
      severity: "HIGH",
      status: "VALIDATED",
      criticality: "CRITICAL",
      instanceCount: 1,
    }) === 15 * 1.0 * 1.5 * 1.0,
    "Validated HIGH on CRITICAL asset = 22.5"
  );

  assert(
    computeFindingDeduction({
      severity: "MEDIUM",
      status: "OPEN",
      criticality: "MEDIUM",
      instanceCount: 1,
    }) === 7 * 0.25 * 1.0 * 1.0,
    "OPEN MEDIUM provisional = 1.75"
  );

  assert(
    computeFindingDeduction({
      severity: "MEDIUM",
      status: "ACCEPTED_RISK",
      criticality: "MEDIUM",
      instanceCount: 1,
    }) === 7 * 0.5,
    "ACCEPTED_RISK = 50%"
  );

  assert(
    computeFindingDeduction({
      severity: "HIGH",
      status: "FALSE_POSITIVE",
      criticality: "CRITICAL",
      instanceCount: 50,
    }) === 0,
    "FALSE_POSITIVE = 0"
  );

  assert(
    computeFindingDeduction({
      severity: "INFO",
      status: "VALIDATED",
      criticality: "CRITICAL",
      instanceCount: 10,
    }) === 0,
    "INFO = 0"
  );

  const asset = await prisma.asset.findFirst({
    where: { organizationId: DEV_ORG_ID },
  });
  if (!asset) throw new Error("Need seeded asset");

  // Unassessed artificial asset
  const unassessed = await prisma.asset.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: asset.clientId,
      name: `Unassessed Score Test ${Date.now()}`,
      type: "WEBSITE",
      url: "https://score-unassessed.example.com",
      criticality: "MEDIUM",
      authorizationStatus: "AUTHORIZED",
      monitoringStatus: "ACTIVE",
    },
  });

  const none = await calculateAssetSecurityPosture(
    DEV_ORG_ID,
    unassessed.id
  );
  assert(!none.assessed && none.score === null, "Unassessed → Not Assessed");

  // Mark assessed via completed passive scan without findings
  await prisma.scan.create({
    data: {
      organizationId: DEV_ORG_ID,
      assetId: unassessed.id,
      scanType: "PASSIVE_WEBSITE",
      status: "COMPLETED",
      startedAt: new Date(),
      completedAt: new Date(),
      overallScore: 90,
    },
  });

  const clean = await calculateAssetSecurityPosture(DEV_ORG_ID, unassessed.id);
  assert(
    clean.assessed && clean.displayScore === 100,
    "Assessed with no findings → 100"
  );
  assert(clean.coverage === "LIMITED", "Passive only → LIMITED coverage");

  const fOpen = await prisma.finding.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: asset.clientId,
      assetId: unassessed.id,
      source: "OWASP_ZAP",
      code: `SCORE_OPEN_${Date.now()}`,
      title: "Open medium",
      severity: "MEDIUM",
      status: "OPEN",
    },
  });

  const withOpen = await calculateAssetSecurityPosture(
    DEV_ORG_ID,
    unassessed.id
  );
  assert(
    withOpen.displayScore === Math.round(100 - 1.75),
    `OPEN provisional score (got ${withOpen.displayScore})`
  );

  await prisma.finding.update({
    where: { id: fOpen.id },
    data: { status: "VALIDATED" },
  });
  const withVal = await calculateAssetSecurityPosture(
    DEV_ORG_ID,
    unassessed.id
  );
  assert(
    withVal.displayScore === Math.round(100 - 7),
    `VALIDATED full deduction (got ${withVal.displayScore})`
  );

  await prisma.finding.update({
    where: { id: fOpen.id },
    data: { status: "IN_PROGRESS" },
  });
  const withProg = await calculateAssetSecurityPosture(
    DEV_ORG_ID,
    unassessed.id
  );
  assert(
    withProg.displayScore === Math.round(100 - 7 * 0.75),
    `IN_PROGRESS 75% (got ${withProg.displayScore})`
  );

  // Floor at 0
  await prisma.finding.createMany({
    data: Array.from({ length: 10 }).map((_, i) => ({
      organizationId: DEV_ORG_ID,
      clientId: asset.clientId,
      assetId: unassessed.id,
      source: "MANUAL" as const,
      code: `SCORE_CRIT_${Date.now()}_${i}`,
      title: `Critical ${i}`,
      severity: "CRITICAL" as const,
      status: "VALIDATED" as const,
    })),
  });
  const floored = await calculateAssetSecurityPosture(
    DEV_ORG_ID,
    unassessed.id
  );
  assert(floored.displayScore === 0, "Score cannot fall below 0");

  const clientScore = await calculateClientSecurityPosture(
    DEV_ORG_ID,
    asset.clientId
  );
  assert(
    clientScore.totalAssets >= 1,
    "Client scoring returns asset rollup"
  );

  const orgScore = await calculateOrganizationSecurityPosture(DEV_ORG_ID);
  assert(orgScore.assetsTotal >= 1, "Org scoring counts assets");
  assert(
    orgScore.assetsAssessed <= orgScore.assetsTotal,
    "Assessed ≤ total"
  );

  await recalculateAndPersistAssetScore(DEV_ORG_ID, unassessed.id);
  const snap1 = await maybeCreateAssetScoreSnapshot({
    organizationId: DEV_ORG_ID,
    assetId: unassessed.id,
    clientId: asset.clientId,
    score: 0,
    coverage: "LIMITED",
    reason: "test",
    actorId: DEV_USER_ID,
  });
  assert(snap1, "Snapshot created on score");

  const snap2 = await maybeCreateAssetScoreSnapshot({
    organizationId: DEV_ORG_ID,
    assetId: unassessed.id,
    clientId: asset.clientId,
    score: 0,
    coverage: "LIMITED",
    reason: "test_again",
    actorId: DEV_USER_ID,
  });
  assert(!snap2, "No duplicate snapshot when unchanged");

  await recalculateScoresForAsset({
    organizationId: DEV_ORG_ID,
    assetId: unassessed.id,
    reason: "test_recalc",
    actorId: DEV_USER_ID,
  });

  // Cleanup
  await prisma.securityScoreSnapshot.deleteMany({
    where: { assetId: unassessed.id },
  });
  await prisma.finding.deleteMany({ where: { assetId: unassessed.id } });
  await prisma.scan.deleteMany({ where: { assetId: unassessed.id } });
  await prisma.asset.delete({ where: { id: unassessed.id } });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
