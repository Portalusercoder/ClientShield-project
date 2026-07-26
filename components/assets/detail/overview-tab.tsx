import Link from "next/link";
import {
  AssetAuthorizationBadge,
  AssetCriticalityBadge,
  AssetEnvironmentBadge,
  AssetMonitoringBadge,
  AssetTypeBadge,
} from "@/components/assets/asset-badges";
import { SecurityPostureCard } from "@/components/assets/security-posture-card";
import { PostureScoreBreakdownCard } from "@/components/scoring/posture-score-breakdown-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { AssetDetail } from "@/types/asset";
import type { AssetPostureScoreResult } from "@/types/scoring";
import type { PostureStatus } from "@/types/security-check";
import type { EndpointWazuhReadiness } from "@/types/wazuh-enrollment";
import { InfoItem } from "./shared";

interface OverviewTabProps {
  asset: AssetDetail;
  isEndpoint: boolean;
  endpointReadiness?: EndpointWazuhReadiness | null;
  findingsPosture: AssetPostureScoreResult;
  passiveCheckScore?: number | null;
  posture: {
    https: PostureStatus;
    tls: PostureStatus;
    headers: PostureStatus;
    cookies: PostureStatus;
  } | null;
}

export function OverviewTab({
  asset,
  isEndpoint,
  endpointReadiness,
  findingsPosture,
  passiveCheckScore,
  posture,
}: OverviewTabProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Asset Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <InfoItem
              label="URL / Hostname"
              value={asset.location}
              isLink={Boolean(asset.url)}
            />
            <InfoItem label="Client" value={asset.clientName} />
            <div>
              <dt className="text-xs font-medium text-muted">Type</dt>
              <dd className="mt-1">
                <AssetTypeBadge type={asset.type} />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">Environment</dt>
              <dd className="mt-1">
                <AssetEnvironmentBadge environment={asset.environment} />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">Criticality</dt>
              <dd className="mt-1">
                <AssetCriticalityBadge criticality={asset.criticality} />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">
                Authorization
              </dt>
              <dd className="mt-1">
                <AssetAuthorizationBadge
                  status={asset.authorizationStatus}
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">Monitoring</dt>
              <dd className="mt-1">
                <AssetMonitoringBadge status={asset.monitoringStatus} />
              </dd>
            </div>
            <InfoItem
              label="Last Security Check"
              value={
                asset.lastSecurityCheckAt
                  ? formatDate(asset.lastSecurityCheckAt)
                  : "Never"
              }
            />
            <InfoItem label="Created" value={formatDate(asset.createdAt)} />
            <InfoItem
              label="Last Updated"
              value={formatDate(asset.updatedAt)}
            />
          </dl>
          {asset.description && (
            <div className="mt-6 border-t border-border pt-4">
              <p className="text-xs font-medium text-muted">Description</p>
              <p className="mt-1 text-sm text-foreground">
                {asset.description}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {isEndpoint && (
          <Card>
            <CardHeader>
              <CardTitle>Wazuh endpoint enrollment</CardTitle>
              <CardDescription>
                {endpointReadiness?.message ??
                  "Prepare remote agent enrollment for this endpoint."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted">Status</span>
                <span className="font-medium">
                  {endpointReadiness?.displayStatus ?? "NOT_CONFIGURED"}
                </span>
              </div>
              {endpointReadiness?.mappedAgentId && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted">Mapped agent</span>
                  <span className="font-medium">
                    {endpointReadiness.mappedAgentId}
                  </span>
                </div>
              )}
              <Link
                href={`/assets/${asset.id}/enrollment`}
                className="inline-flex text-accent hover:underline"
              >
                Open enrollment →
              </Link>
            </CardContent>
          </Card>
        )}

        <PostureScoreBreakdownCard
          posture={findingsPosture}
          passiveScore={passiveCheckScore}
        />

        <Card>
          <CardHeader>
            <CardTitle>Passive Check Indicators</CardTitle>
            <CardDescription>
              HTTPS / TLS / Headers / Cookies from the latest passive check
            </CardDescription>
          </CardHeader>
          <CardContent>
            {posture ? (
              <SecurityPostureCard {...posture} />
            ) : (
              <p className="text-sm text-muted">
                Run a security check to populate posture indicators.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
