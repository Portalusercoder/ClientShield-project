import { prisma } from "@/lib/db";
import { CLIENT_ASSET_WEIGHTS } from "@/services/scoring/scoring.constants";
import { calculateAssetSecurityPosture } from "@/services/scoring/asset-security-score.service";
import { SCORE_DISCLAIMER } from "@/types/scoring";
import type { ClientPostureScoreResult } from "@/types/scoring";

function roundScore(n: number): number {
  return Math.round(n);
}

export async function calculateClientSecurityPosture(
  organizationId: string,
  clientId: string
): Promise<ClientPostureScoreResult> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true },
  });
  if (!client) throw new Error("Client not found");

  const assets = await prisma.asset.findMany({
    where: { organizationId, clientId },
    select: { id: true, name: true, criticality: true },
  });

  const assetScores: ClientPostureScoreResult["assetScores"] = [];
  let weightedSum = 0;
  let weightTotal = 0;
  let assessedAssets = 0;
  let criticalAssets = 0;
  let openFindings = 0;
  let validatedFindings = 0;
  let acceptedRisks = 0;

  for (const asset of assets) {
    if (asset.criticality === "CRITICAL") criticalAssets += 1;
    const posture = await calculateAssetSecurityPosture(
      organizationId,
      asset.id
    );
    const weight = CLIENT_ASSET_WEIGHTS[asset.criticality];
    assetScores.push({
      assetId: asset.id,
      assetName: asset.name,
      criticality: asset.criticality,
      score: posture.displayScore,
      weight,
    });
    openFindings += posture.openFindings;
    validatedFindings += posture.validatedFindings;
    acceptedRisks += posture.acceptedRisks;

    if (posture.assessed && posture.displayScore != null) {
      assessedAssets += 1;
      weightedSum += posture.displayScore * weight;
      weightTotal += weight;
    }
  }

  if (assessedAssets === 0 || weightTotal === 0) {
    return {
      score: null,
      displayScore: null,
      assessedAssets: 0,
      totalAssets: assets.length,
      coveragePercent: assets.length === 0 ? null : 0,
      criticalAssets,
      openFindings,
      validatedFindings,
      acceptedRisks,
      assetScores,
      disclaimer: SCORE_DISCLAIMER,
    };
  }

  const raw = weightedSum / weightTotal;
  const displayScore = roundScore(raw);
  const coveragePercent =
    assets.length === 0
      ? null
      : Math.round((assessedAssets / assets.length) * 100);

  return {
    score: raw,
    displayScore,
    assessedAssets,
    totalAssets: assets.length,
    coveragePercent,
    criticalAssets,
    openFindings,
    validatedFindings,
    acceptedRisks,
    assetScores,
    disclaimer: SCORE_DISCLAIMER,
  };
}

export async function recalculateAndPersistClientScore(
  organizationId: string,
  clientId: string
): Promise<ClientPostureScoreResult> {
  const result = await calculateClientSecurityPosture(organizationId, clientId);
  await prisma.client.update({
    where: { id: clientId },
    data: { securityScore: result.displayScore },
  });
  return result;
}
