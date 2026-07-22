import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssetDetailView } from "@/components/assets/asset-detail-view";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import {
  getAssetById,
  listClientOptions,
} from "@/services/assets.service";
import { listFindingsForAsset } from "@/services/findings.service";
import { listIncidentsForAsset } from "@/services/incidents.service";
import { calculateAssetSecurityPosture } from "@/services/scoring/asset-security-score.service";
import {
  getSecurityCheckById,
  listSecurityChecks,
} from "@/services/security-checks/security-check.service";
import { listZapBaselineScans } from "@/services/zap/zap-baseline.service";

export const dynamic = "force-dynamic";

interface AssetDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: AssetDetailPageProps): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const asset = await getAssetById(session.organizationId, id);

  return {
    title: asset ? asset.name : "Asset Not Found",
  };
}

export default async function AssetDetailPage({
  params,
}: AssetDetailPageProps) {
  const session = await requireSession();
  const { id } = await params;

  const asset = await getAssetById(session.organizationId, id);
  if (!asset) {
    notFound();
  }

  const [
    clients,
    securityChecks,
    zapScans,
    findings,
    findingsPosture,
    incidents,
    securityEvents,
  ] = await Promise.all([
    listClientOptions(session.organizationId),
    listSecurityChecks(session.organizationId, id),
    listZapBaselineScans(session.organizationId, id),
    listFindingsForAsset(session.organizationId, id),
    calculateAssetSecurityPosture(session.organizationId, id),
    listIncidentsForAsset(session.organizationId, id),
    (
      await import("@/services/security-events.service")
    ).listSecurityEventsForAsset(session.organizationId, id),
  ]);

  const latestCompleted = securityChecks.find(
    (c) => c.status === "COMPLETED" || c.status === "FAILED"
  );
  const latestDetail = latestCompleted
    ? await getSecurityCheckById(session.organizationId, latestCompleted.id)
    : null;

  const canRunCheck =
    hasMinimumRole(session, "ANALYST") &&
    (asset.type === "WEBSITE" || asset.type === "WEB_APPLICATION") &&
    asset.authorizationStatus === "AUTHORIZED" &&
    asset.monitoringStatus === "ACTIVE" &&
    Boolean(asset.url);

  return (
    <AssetDetailView
      asset={asset}
      clients={clients}
      canEdit={hasMinimumRole(session, "ANALYST")}
      canArchive={hasMinimumRole(session, "ADMIN")}
      canRunCheck={canRunCheck}
      securityChecks={securityChecks}
      zapScans={zapScans}
      findings={findings.map((f) => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        status: f.status,
        source: f.source,
        code: f.code,
        instanceCount: f.instanceCount,
        firstDetectedAt: f.firstDetectedAt,
        lastDetectedAt: f.lastDetectedAt,
      }))}
      incidents={incidents}
      securityEvents={securityEvents}
      posture={latestDetail?.summary?.posture ?? null}
      findingsPosture={findingsPosture}
      passiveCheckScore={latestDetail?.overallScore ?? null}
    />
  );
}
