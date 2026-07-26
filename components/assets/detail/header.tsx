import Link from "next/link";
import {
  AssetMonitoringBadge,
  AssetTypeBadge,
} from "@/components/assets/asset-badges";
import { RunSecurityCheckButton } from "@/components/assets/run-security-check-button";
import { RunZapBaselineButton } from "@/components/assets/run-zap-baseline-button";
import { Button } from "@/components/ui/button";
import { PageBreadcrumbs } from "@/components/workflow/page-breadcrumbs";
import type { AssetDetail } from "@/types/asset";

interface AssetDetailHeaderProps {
  asset: AssetDetail;
  canRunCheck: boolean;
  blockedReason: string | null;
  isEndpoint: boolean;
  canEdit: boolean;
  canArchive: boolean;
  onEdit: () => void;
  onArchive: () => void;
}

export function AssetDetailHeader({
  asset,
  canRunCheck,
  blockedReason,
  isEndpoint,
  canEdit,
  canArchive,
  onEdit,
  onArchive,
}: AssetDetailHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <PageBreadcrumbs
          items={[
            { label: "Assets", href: "/assets" },
            ...(asset.clientId
              ? [{ label: "Client", href: `/clients/${asset.clientId}` }]
              : []),
            { label: asset.name },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">
            {asset.name}
          </h1>
          <AssetTypeBadge type={asset.type} />
          <AssetMonitoringBadge status={asset.monitoringStatus} />
        </div>
        <p className="mt-1 text-sm text-muted">
          Client:{" "}
          <Link
            href={`/clients/${asset.clientId}`}
            className="text-accent hover:underline"
          >
            {asset.clientName}
          </Link>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <RunSecurityCheckButton
          assetId={asset.id}
          canRun={canRunCheck}
          blockedReason={blockedReason}
        />
        <RunZapBaselineButton
          assetId={asset.id}
          canRun={canRunCheck}
          blockedReason={blockedReason}
        />
        {isEndpoint && (
          <Link href={`/assets/${asset.id}/enrollment`}>
            <Button variant="secondary">Remote enrollment</Button>
          </Link>
        )}
        {canEdit && (
          <Button variant="secondary" onClick={onEdit}>
            Edit Asset
          </Button>
        )}
        {canArchive && asset.monitoringStatus !== "INACTIVE" && (
          <Button variant="danger" onClick={onArchive}>
            Archive
          </Button>
        )}
      </div>
    </div>
  );
}
