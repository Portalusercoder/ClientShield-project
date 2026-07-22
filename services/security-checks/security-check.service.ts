import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/services/audit.service";
import { checkCookieSecurity } from "@/services/security-checks/cookie-check.service";
import { syncPassiveFindings } from "@/services/security-checks/findings.service";
import { checkSecurityHeaders } from "@/services/security-checks/headers-check.service";
import {
  checkHttpsAvailability,
  fetchAuthorizedAssetHeaders,
} from "@/services/security-checks/http-check.service";
import { calculateSecurityScore } from "@/services/security-checks/scoring.service";
import { checkTlsCertificate } from "@/services/security-checks/tls-check.service";
import type {
  SecurityCheckDetail,
  SecurityCheckListItem,
  SecurityCheckSummary,
} from "@/types/security-check";

export const PASSIVE_SCAN_TYPE = "PASSIVE_WEBSITE";
const RATE_LIMIT_MS = 60_000;

function asSummary(value: Prisma.JsonValue | null): SecurityCheckSummary | null {
  if (!value || typeof value !== "object") return null;
  return value as unknown as SecurityCheckSummary;
}

function mapListItem(scan: {
  id: string;
  status: string;
  overallScore: number | null;
  durationMs: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  summary: Prisma.JsonValue | null;
}): SecurityCheckListItem {
  const summary = asSummary(scan.summary);
  return {
    id: scan.id,
    status: scan.status,
    overallScore: scan.overallScore,
    durationMs: scan.durationMs,
    startedAt: scan.startedAt,
    completedAt: scan.completedAt,
    createdAt: scan.createdAt,
    httpsReachable: summary?.https.reachable ?? null,
    tlsStatus: summary?.tls.status ?? null,
    headersPresent: summary?.headers.presentCount ?? null,
    headersMissing: summary?.headers.missingCount ?? null,
  };
}

/**
 * Loads an asset eligible for passive website security checks.
 * Enforces org ownership, type, authorization, and monitoring status.
 */
export async function getEligibleAssetForCheck(
  organizationId: string,
  assetId: string
) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId },
  });

  if (!asset) {
    throw new Error("Asset not found");
  }

  if (asset.type !== "WEBSITE" && asset.type !== "WEB_APPLICATION") {
    throw new Error(
      "Passive security checks are only supported for WEBSITE and WEB_APPLICATION assets"
    );
  }

  if (asset.authorizationStatus !== "AUTHORIZED") {
    throw new Error(
      "Asset must be AUTHORIZED before a security check can run"
    );
  }

  if (asset.monitoringStatus !== "ACTIVE") {
    throw new Error("Asset monitoring status must be ACTIVE");
  }

  if (!asset.url) {
    throw new Error("Asset does not have a stored URL");
  }

  return asset;
}

export async function listSecurityChecks(
  organizationId: string,
  assetId: string
): Promise<SecurityCheckListItem[]> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId },
    select: { id: true },
  });
  if (!asset) return [];

  const scans = await prisma.scan.findMany({
    where: {
      organizationId,
      assetId,
      scanType: PASSIVE_SCAN_TYPE,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return scans.map(mapListItem);
}

export async function getSecurityCheckById(
  organizationId: string,
  scanId: string
): Promise<SecurityCheckDetail | null> {
  const scan = await prisma.scan.findFirst({
    where: { id: scanId, organizationId, scanType: PASSIVE_SCAN_TYPE },
  });
  if (!scan) return null;

  return {
    ...mapListItem(scan),
    summary: asSummary(scan.summary),
    errorMessage: scan.errorMessage,
    scanType: scan.scanType,
  };
}

/**
 * Runs a manual passive security check against a stored authorized asset URL.
 * Never accepts arbitrary URLs from the client.
 */
export async function runPassiveSecurityCheck(input: {
  organizationId: string;
  userId: string;
  assetId: string;
}): Promise<SecurityCheckDetail> {
  const asset = await getEligibleAssetForCheck(
    input.organizationId,
    input.assetId
  );

  const running = await prisma.scan.findFirst({
    where: {
      organizationId: input.organizationId,
      assetId: asset.id,
      scanType: PASSIVE_SCAN_TYPE,
      status: "RUNNING",
    },
  });
  if (running) {
    throw new Error("A security check is already running for this asset");
  }

  const recent = await prisma.scan.findFirst({
    where: {
      organizationId: input.organizationId,
      assetId: asset.id,
      scanType: PASSIVE_SCAN_TYPE,
      createdAt: { gte: new Date(Date.now() - RATE_LIMIT_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    throw new Error(
      "Please wait at least 60 seconds before running another check for this asset"
    );
  }

  const startedAt = new Date();
  const scan = await prisma.scan.create({
    data: {
      organizationId: input.organizationId,
      assetId: asset.id,
      scanType: PASSIVE_SCAN_TYPE,
      status: "RUNNING",
      startedAt,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.userId,
    action: "SECURITY_CHECK_STARTED",
    resourceType: "Scan",
    resourceId: scan.id,
    metadata: { assetId: asset.id, scanType: PASSIVE_SCAN_TYPE },
  });

  try {
    // Use only the URL stored in PostgreSQL after ownership validation.
    const storedUrl = asset.url!;

    const https = await checkHttpsAvailability(storedUrl);
    const tls = await checkTlsCertificate(storedUrl);

    let headers = checkSecurityHeaders({});
    let cookies = checkCookieSecurity({});

    if (https.reachable && https.finalUrl) {
      try {
        const headerFetch = await fetchAuthorizedAssetHeaders(https.finalUrl);
        headers = checkSecurityHeaders(headerFetch.headers);
        cookies = checkCookieSecurity(headerFetch.headers);
      } catch {
        // Keep empty header/cookie results if secondary fetch fails.
      }
    }

    const { score, breakdown, posture } = calculateSecurityScore({
      https,
      tls,
      headers,
      cookies,
    });

    const summary: SecurityCheckSummary = {
      https,
      tls,
      headers,
      cookies,
      scoreBreakdown: breakdown,
      posture,
    };

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    const completed = await prisma.scan.update({
      where: { id: scan.id },
      data: {
        status: https.reachable ? "COMPLETED" : "FAILED",
        completedAt,
        durationMs,
        overallScore: score,
        summary: summary as unknown as Prisma.InputJsonValue,
        errorMessage: https.reachable ? null : https.error,
      },
    });

    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        lastSecurityCheckAt: completedAt,
      },
    });

    await syncPassiveFindings({
      organizationId: input.organizationId,
      assetId: asset.id,
      scanId: scan.id,
      summary,
      actorId: input.userId,
    });

    // Posture score is findings-based; Scan.overallScore keeps passive check score.
    const { recalculateScoresForAsset } = await import(
      "@/services/scoring/score-snapshot.service"
    );
    await recalculateScoresForAsset({
      organizationId: input.organizationId,
      assetId: asset.id,
      reason: "passive_check_completed",
      actorId: input.userId,
    });

    await createAuditLog({
      organizationId: input.organizationId,
      actorId: input.userId,
      action: https.reachable
        ? "SECURITY_CHECK_COMPLETED"
        : "SECURITY_CHECK_FAILED",
      resourceType: "Scan",
      resourceId: scan.id,
      metadata: {
        assetId: asset.id,
        overallScore: score,
        status: completed.status,
      },
    });

    return {
      ...mapListItem(completed),
      summary,
      errorMessage: completed.errorMessage,
      scanType: completed.scanType,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Security check failed";

    await prisma.scan.update({
      where: { id: scan.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        errorMessage: message,
      },
    });

    await createAuditLog({
      organizationId: input.organizationId,
      actorId: input.userId,
      action: "SECURITY_CHECK_FAILED",
      resourceType: "Scan",
      resourceId: scan.id,
      metadata: { assetId: asset.id, error: message },
    });

    throw error;
  }
}
