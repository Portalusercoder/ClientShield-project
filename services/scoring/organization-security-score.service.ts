import { prisma } from "@/lib/db";
import { calculateAssetSecurityPosture } from "@/services/scoring/asset-security-score.service";
import { SCORE_DISCLAIMER } from "@/types/scoring";
import type { OrganizationPostureScoreResult } from "@/types/scoring";

function roundScore(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Organization average security posture — assessed assets only.
 * Unassessed assets are excluded (not treated as 100).
 */
export async function calculateOrganizationSecurityPosture(
  organizationId: string
): Promise<OrganizationPostureScoreResult> {
  const assets = await prisma.asset.findMany({
    where: { organizationId },
    select: { id: true },
  });

  let sum = 0;
  let assessed = 0;

  for (const asset of assets) {
    const posture = await calculateAssetSecurityPosture(
      organizationId,
      asset.id
    );
    if (posture.assessed && posture.displayScore != null) {
      sum += posture.displayScore;
      assessed += 1;
    }
  }

  return {
    averageScore: assessed === 0 ? null : roundScore(sum / assessed),
    assetsAssessed: assessed,
    assetsTotal: assets.length,
    disclaimer: SCORE_DISCLAIMER,
  };
}
