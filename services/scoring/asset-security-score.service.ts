import type {
  AssessmentCoverage,
  AssetCriticality,
  FindingSeverity,
  FindingStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  ASSET_CRITICALITY_MULTIPLIERS,
  exposureModifier,
  LIFECYCLE_MULTIPLIERS,
  POSTURE_SCORE_BASE,
  SEVERITY_WEIGHTS,
} from "@/services/scoring/scoring.constants";
import { SCORE_DISCLAIMER } from "@/types/scoring";
import type { AssetPostureScoreResult, ScoreBreakdownLine } from "@/types/scoring";

function roundScore(n: number): number {
  return Math.round(n);
}

export function computeFindingDeduction(input: {
  severity: FindingSeverity;
  status: FindingStatus;
  criticality: AssetCriticality;
  instanceCount: number;
}): number {
  const weight = SEVERITY_WEIGHTS[input.severity];
  if (weight <= 0) return 0;
  const life = LIFECYCLE_MULTIPLIERS[input.status];
  if (life <= 0) return 0;
  const crit = ASSET_CRITICALITY_MULTIPLIERS[input.criticality];
  const exposure = exposureModifier(input.instanceCount);
  return weight * life * crit * exposure;
}

async function resolveCoverage(
  organizationId: string,
  assetId: string
): Promise<{
  coverage: AssessmentCoverage | null;
  assessed: boolean;
  lastAssessedAt: Date | null;
}> {
  const scans = await prisma.scan.findMany({
    where: {
      organizationId,
      assetId,
      status: { in: ["COMPLETED", "PARTIAL"] },
    },
    select: { scanType: true, completedAt: true, createdAt: true },
    orderBy: { completedAt: "desc" },
  });

  if (scans.length === 0) {
    return { coverage: null, assessed: false, lastAssessedAt: null };
  }

  const hasPassive = scans.some((s) => s.scanType === "PASSIVE_WEBSITE");
  const hasZap = scans.some((s) => s.scanType === "ZAP_BASELINE");
  const lastAssessedAt =
    scans[0]?.completedAt ?? scans[0]?.createdAt ?? null;

  if (hasPassive && hasZap) {
    return { coverage: "BASIC", assessed: true, lastAssessedAt };
  }
  if (hasPassive || hasZap) {
    return { coverage: "LIMITED", assessed: true, lastAssessedAt };
  }
  return { coverage: "LIMITED", assessed: true, lastAssessedAt };
}

/**
 * Calculate ClientShield Security Posture Score for an asset.
 * Findings-based only — does not double-count passive Scan.overallScore.
 */
export async function calculateAssetSecurityPosture(
  organizationId: string,
  assetId: string
): Promise<AssetPostureScoreResult> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId },
    select: {
      id: true,
      criticality: true,
      lastSecurityCheckAt: true,
    },
  });

  if (!asset) {
    throw new Error("Asset not found");
  }

  const { coverage, assessed, lastAssessedAt } = await resolveCoverage(
    organizationId,
    assetId
  );

  if (!assessed) {
    return {
      score: null,
      displayScore: null,
      coverage: null,
      assessed: false,
      baseScore: POSTURE_SCORE_BASE,
      totalDeduction: 0,
      breakdown: [
        {
          label: "Not Assessed",
          amount: 0,
          detail: "No completed passive or ZAP baseline scan yet",
        },
      ],
      lastAssessedAt: null,
      openFindings: 0,
      validatedFindings: 0,
      acceptedRisks: 0,
      disclaimer: SCORE_DISCLAIMER,
    };
  }

  const findings = await prisma.finding.findMany({
    where: { organizationId, assetId },
    select: {
      title: true,
      severity: true,
      status: true,
      _count: { select: { instances: true } },
    },
  });

  const breakdown: ScoreBreakdownLine[] = [
    { label: "Starting Score", amount: POSTURE_SCORE_BASE },
  ];

  let totalDeduction = 0;
  let openFindings = 0;
  let validatedFindings = 0;
  let acceptedRisks = 0;

  for (const f of findings) {
    if (f.status === "OPEN") openFindings += 1;
    if (f.status === "VALIDATED") validatedFindings += 1;
    if (f.status === "ACCEPTED_RISK") acceptedRisks += 1;

    const instances = Math.max(1, f._count.instances || 1);
    // Passive findings without instances still count as 1 location
    const instanceCount = f._count.instances > 0 ? f._count.instances : 1;
    const deduction = computeFindingDeduction({
      severity: f.severity,
      status: f.status,
      criticality: asset.criticality,
      instanceCount,
    });

    if (deduction <= 0) continue;

    totalDeduction += deduction;
    const life = LIFECYCLE_MULTIPLIERS[f.status];
    const exposure = exposureModifier(instanceCount);
    breakdown.push({
      label: `${f.severity} · ${f.status}: ${f.title}`,
      amount: -deduction,
      detail: `weight=${SEVERITY_WEIGHTS[f.severity]} × lifecycle=${life} × criticality=${ASSET_CRITICALITY_MULTIPLIERS[asset.criticality]} × exposure=${exposure} (instances=${instances})`,
    });
  }

  const raw = Math.max(0, POSTURE_SCORE_BASE - totalDeduction);
  const displayScore = roundScore(raw);

  breakdown.push({
    label: "Asset Criticality",
    amount: 0,
    detail: `${asset.criticality} multiplier applied per finding`,
  });
  breakdown.push({
    label: "Final Score",
    amount: displayScore,
    detail: raw === displayScore ? undefined : `raw ${raw.toFixed(2)} → ${displayScore}`,
  });

  return {
    score: raw,
    displayScore,
    coverage,
    assessed: true,
    baseScore: POSTURE_SCORE_BASE,
    totalDeduction,
    breakdown,
    lastAssessedAt: lastAssessedAt ?? asset.lastSecurityCheckAt,
    openFindings,
    validatedFindings,
    acceptedRisks,
    disclaimer: SCORE_DISCLAIMER,
  };
}

/**
 * Persist asset posture score and return calculation.
 */
export async function recalculateAndPersistAssetScore(
  organizationId: string,
  assetId: string
): Promise<AssetPostureScoreResult> {
  const result = await calculateAssetSecurityPosture(organizationId, assetId);
  await prisma.asset.update({
    where: { id: assetId },
    data: { securityScore: result.displayScore },
  });
  return result;
}
