import type { AssessmentCoverage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/services/audit.service";
import {
  recalculateAndPersistAssetScore,
} from "@/services/scoring/asset-security-score.service";
import {
  recalculateAndPersistClientScore,
} from "@/services/scoring/client-security-score.service";

/**
 * Persist a score snapshot only when score or coverage changed.
 */
export async function maybeCreateAssetScoreSnapshot(input: {
  organizationId: string;
  assetId: string;
  clientId: string | null;
  score: number | null;
  coverage: AssessmentCoverage | null;
  reason: string;
  actorId?: string | null;
}): Promise<boolean> {
  if (input.score == null) return false;

  const latest = await prisma.securityScoreSnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      assetId: input.assetId,
    },
    orderBy: { calculatedAt: "desc" },
  });

  if (
    latest &&
    latest.score === input.score &&
    latest.coverage === input.coverage
  ) {
    return false;
  }

  await prisma.securityScoreSnapshot.create({
    data: {
      organizationId: input.organizationId,
      assetId: input.assetId,
      clientId: input.clientId,
      score: input.score,
      coverage: input.coverage,
      reason: input.reason,
    },
  });

  if (input.actorId) {
    await createAuditLog({
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: "SECURITY_SCORE_RECALCULATED",
      resourceType: "Asset",
      resourceId: input.assetId,
      metadata: {
        score: input.score,
        coverage: input.coverage,
        reason: input.reason,
        clientId: input.clientId,
      },
    });
  }

  return true;
}

/**
 * Recalculate asset + client posture and snapshot if changed.
 */
export async function recalculateScoresForAsset(input: {
  organizationId: string;
  assetId: string;
  reason: string;
  actorId?: string | null;
}): Promise<void> {
  const asset = await prisma.asset.findFirst({
    where: { id: input.assetId, organizationId: input.organizationId },
    select: { clientId: true },
  });
  if (!asset) return;

  const posture = await recalculateAndPersistAssetScore(
    input.organizationId,
    input.assetId
  );

  await maybeCreateAssetScoreSnapshot({
    organizationId: input.organizationId,
    assetId: input.assetId,
    clientId: asset.clientId,
    score: posture.displayScore,
    coverage: posture.coverage,
    reason: input.reason,
    actorId: input.actorId,
  });

  await recalculateAndPersistClientScore(
    input.organizationId,
    asset.clientId
  );
}
