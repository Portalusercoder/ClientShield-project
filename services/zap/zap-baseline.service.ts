import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { createAuditLog } from "@/services/audit.service";
import { assertSafeUrl } from "@/services/security-checks/network-safety.service";
import { getEligibleAssetForCheck } from "@/services/security-checks/security-check.service";
import {
  countAlertsBySeverity,
  normalizeZapAlert,
} from "@/services/zap/zap-alert-normalizer.service";
import {
  accessUrl,
  getAlerts,
  getZapVersion,
  newZapSession,
  pingZap,
  startSpider,
  waitForSpiderAndPassive,
  ZapClientError,
} from "@/services/zap/zap-client.service";
import { syncZapFindings } from "@/services/zap/zap-findings.service";
import {
  ZAP_BASELINE_SCAN_TYPE,
  ZAP_RATE_LIMIT_MS,
  type ZapScanDetail,
  type ZapScanListItem,
  type ZapScanSummary,
} from "@/types/zap";

function asSummary(value: Prisma.JsonValue | null): ZapScanSummary | null {
  if (!value || typeof value !== "object") return null;
  return value as unknown as ZapScanSummary;
}

function mapListItem(scan: {
  id: string;
  status: string;
  scanType: string;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  createdAt: Date;
  scannerVersion: string | null;
  errorMessage: string | null;
  summary: Prisma.JsonValue | null;
}): ZapScanListItem {
  const summary = asSummary(scan.summary);
  return {
    id: scan.id,
    status: scan.status,
    scanType: scan.scanType,
    startedAt: scan.startedAt,
    completedAt: scan.completedAt,
    durationMs: scan.durationMs,
    createdAt: scan.createdAt,
    scannerVersion: scan.scannerVersion,
    errorMessage: scan.errorMessage,
    alertCounts: summary?.alertCounts ?? null,
  };
}

export async function listZapBaselineScans(
  organizationId: string,
  assetId: string
): Promise<ZapScanListItem[]> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId },
    select: { id: true },
  });
  if (!asset) return [];

  const scans = await prisma.scan.findMany({
    where: {
      organizationId,
      assetId,
      scanType: ZAP_BASELINE_SCAN_TYPE,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return scans.map(mapListItem);
}

export async function getZapBaselineScanById(
  organizationId: string,
  scanId: string
): Promise<ZapScanDetail | null> {
  const scan = await prisma.scan.findFirst({
    where: {
      id: scanId,
      organizationId,
      scanType: ZAP_BASELINE_SCAN_TYPE,
    },
    include: {
      asset: { select: { id: true, name: true } },
    },
  });
  if (!scan) return null;

  const summary = asSummary(scan.summary);
  return {
    ...mapListItem(scan),
    summary,
    assetId: scan.asset.id,
    assetName: scan.asset.name,
    findingsCreated: summary?.findingsCreated ?? 0,
    findingsUpdated: summary?.findingsUpdated ?? 0,
  };
}

/**
 * Runs an OWASP ZAP baseline (spider + passive) assessment.
 * Never invokes Active Scan APIs.
 *
 * Designed so the body can later move to a Redis/BullMQ worker:
 * create QUEUED scan → worker picks up → RUNNING → COMPLETED/PARTIAL/FAILED.
 */
export async function runZapBaselineScan(input: {
  organizationId: string;
  userId: string;
  assetId: string;
}): Promise<ZapScanDetail> {
  // Reuse eligibility gates from passive checks (org, type, auth, monitoring, URL)
  const asset = await getEligibleAssetForCheck(
    input.organizationId,
    input.assetId
  );

  const active = await prisma.scan.findFirst({
    where: {
      organizationId: input.organizationId,
      assetId: asset.id,
      scanType: ZAP_BASELINE_SCAN_TYPE,
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });
  if (active) {
    throw new Error("A ZAP baseline scan is already in progress for this asset");
  }

  const recent = await prisma.scan.findFirst({
    where: {
      organizationId: input.organizationId,
      assetId: asset.id,
      scanType: ZAP_BASELINE_SCAN_TYPE,
      createdAt: { gte: new Date(Date.now() - ZAP_RATE_LIMIT_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    throw new Error(
      "Please wait at least 5 minutes before running another ZAP baseline scan for this asset"
    );
  }

  // SSRF / network-safety before handing the URL to ZAP
  const safeUrl = await assertSafeUrl(asset.url!);
  const targetUrl = safeUrl.toString();

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.userId,
    action: "ZAP_BASELINE_SCAN_REQUESTED",
    resourceType: "Asset",
    resourceId: asset.id,
    metadata: { scanType: ZAP_BASELINE_SCAN_TYPE },
  });

  const available = await pingZap();
  if (!available) {
    throw new Error(
      "OWASP ZAP is unavailable. Start the clientshield-zap service with Docker Compose."
    );
  }

  const startedAt = new Date();
  const scan = await prisma.scan.create({
    data: {
      organizationId: input.organizationId,
      assetId: asset.id,
      scanType: ZAP_BASELINE_SCAN_TYPE,
      status: "QUEUED",
      startedAt,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.userId,
    action: "ZAP_BASELINE_SCAN_STARTED",
    resourceType: "Scan",
    resourceId: scan.id,
    metadata: { assetId: asset.id, scanType: ZAP_BASELINE_SCAN_TYPE },
  });

  try {
    await prisma.scan.update({
      where: { id: scan.id },
      data: { status: "RUNNING" },
    });

    const version = await getZapVersion();
    const spiderMinutes = serverEnv.ZAP_SPIDER_MAX_MINUTES;
    const timeoutMs = serverEnv.ZAP_SCAN_TIMEOUT_MS;
    const warnings: string[] = [];

    await newZapSession(`clientshield-${scan.id}`);
    await accessUrl(targetUrl);

    const spiderId = await startSpider({
      url: targetUrl,
      maxDurationMinutes: spiderMinutes,
    });

    const wait = await waitForSpiderAndPassive({
      spiderId,
      timeoutMs,
    });

    if (!wait.spiderComplete) {
      warnings.push("Spider did not fully complete before timeout");
    }
    if (!wait.passiveComplete) {
      warnings.push("Passive scan queue may still have had pending records");
    }

    const rawAlerts = await getAlerts(targetUrl);
    const normalized = rawAlerts
      .map((a) => normalizeZapAlert(a))
      .filter((a): a is NonNullable<typeof a> => a != null);

    const syncResult = await syncZapFindings({
      organizationId: input.organizationId,
      assetId: asset.id,
      scanId: scan.id,
      findings: normalized,
      actorId: input.userId,
    });

    const alertCounts = countAlertsBySeverity(normalized);
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const status =
      warnings.length > 0 || !wait.spiderComplete || !wait.passiveComplete
        ? "PARTIAL"
        : "COMPLETED";

    const summary: ZapScanSummary = {
      scanner: "OWASP_ZAP",
      scanMode: "BASELINE_PASSIVE",
      targetHost: safeUrl.host,
      spiderMaxMinutes: spiderMinutes,
      alertCounts,
      findingsCreated: syncResult.created,
      findingsUpdated: syncResult.updated + syncResult.reopened,
      findingsReopened: syncResult.reopened,
      instancesCreated: syncResult.instancesCreated,
      instancesUpdated: syncResult.instancesUpdated,
      alertsFetched: rawAlerts.length,
      warnings,
      resolutionPolicy: "NO_AUTO_RESOLVE_ON_ABSENCE",
    };

    await prisma.scan.update({
      where: { id: scan.id },
      data: {
        status,
        completedAt,
        durationMs,
        scannerVersion: version,
        summary: summary as unknown as Prisma.InputJsonValue,
        errorMessage: null,
      },
    });

    const { recalculateScoresForAsset } = await import(
      "@/services/scoring/score-snapshot.service"
    );
    await recalculateScoresForAsset({
      organizationId: input.organizationId,
      assetId: asset.id,
      reason: "zap_baseline_imported",
      actorId: input.userId,
    });

    await createAuditLog({
      organizationId: input.organizationId,
      actorId: input.userId,
      action: "ZAP_BASELINE_SCAN_COMPLETED",
      resourceType: "Scan",
      resourceId: scan.id,
      metadata: {
        assetId: asset.id,
        status,
        alertCounts,
        findingsCreated: syncResult.created,
        findingsUpdated: syncResult.updated,
        findingsReopened: syncResult.reopened,
        instancesCreated: syncResult.instancesCreated,
        instancesUpdated: syncResult.instancesUpdated,
      },
    });

    await createAuditLog({
      organizationId: input.organizationId,
      actorId: input.userId,
      action: "ZAP_FINDINGS_IMPORTED",
      resourceType: "Scan",
      resourceId: scan.id,
      metadata: {
        assetId: asset.id,
        created: syncResult.created,
        updated: syncResult.updated,
        reopened: syncResult.reopened,
        instancesCreated: syncResult.instancesCreated,
        instancesUpdated: syncResult.instancesUpdated,
      },
    });

    const detail = await getZapBaselineScanById(
      input.organizationId,
      scan.id
    );
    if (!detail) throw new Error("Scan not found after completion");
    return detail;
  } catch (error) {
    const completedAt = new Date();
    const safeMessage =
      error instanceof ZapClientError
        ? error.message
        : error instanceof Error
          ? error.message
          : "ZAP baseline scan failed";

    // Never persist stack traces
    await prisma.scan.update({
      where: { id: scan.id },
      data: {
        status: "FAILED",
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        errorMessage: safeMessage.slice(0, 1000),
      },
    });

    await createAuditLog({
      organizationId: input.organizationId,
      actorId: input.userId,
      action: "ZAP_BASELINE_SCAN_FAILED",
      resourceType: "Scan",
      resourceId: scan.id,
      metadata: {
        assetId: asset.id,
        error: safeMessage.slice(0, 200),
      },
    });

    throw new Error(safeMessage);
  }
}
