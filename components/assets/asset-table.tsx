import Link from "next/link";
import {
  AssetAuthorizationBadge,
  AssetCriticalityBadge,
  AssetEnvironmentBadge,
  AssetMonitoringBadge,
  AssetTypeBadge,
} from "@/components/assets/asset-badges";
import { SecurityScoreIndicator } from "@/components/clients/client-status-badge";
import { formatDate } from "@/lib/utils";
import type { AssetListItem } from "@/types/asset";

interface AssetTableProps {
  assets: AssetListItem[];
}

export function AssetTable({ assets }: AssetTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-elevated">
            <th className="px-4 py-3 font-medium text-muted">Asset Name</th>
            <th className="hidden px-4 py-3 font-medium text-muted md:table-cell">
              Client
            </th>
            <th className="px-4 py-3 font-medium text-muted">Type</th>
            <th className="hidden px-4 py-3 font-medium text-muted lg:table-cell">
              URL / Hostname
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted xl:table-cell">
              Environment
            </th>
            <th className="px-4 py-3 font-medium text-muted">Criticality</th>
            <th className="hidden px-4 py-3 font-medium text-muted sm:table-cell">
              Monitoring
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted lg:table-cell">
              Authorization
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted xl:table-cell">
              Last Check
            </th>
            <th className="px-4 py-3 font-medium text-muted">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {assets.map((asset) => (
            <tr
              key={asset.id}
              className="bg-surface transition-colors hover:bg-surface-elevated/50"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/assets/${asset.id}`}
                  className="font-medium text-foreground hover:text-accent"
                >
                  {asset.name}
                </Link>
              </td>
              <td className="hidden px-4 py-3 text-muted md:table-cell">
                <Link
                  href={`/clients/${asset.clientId}`}
                  className="hover:text-accent"
                >
                  {asset.clientName}
                </Link>
              </td>
              <td className="px-4 py-3">
                <AssetTypeBadge type={asset.type} />
              </td>
              <td className="hidden max-w-[220px] truncate px-4 py-3 text-muted lg:table-cell">
                {asset.url ? (
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {asset.location.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  asset.location
                )}
              </td>
              <td className="hidden px-4 py-3 xl:table-cell">
                <AssetEnvironmentBadge environment={asset.environment} />
              </td>
              <td className="px-4 py-3">
                <AssetCriticalityBadge criticality={asset.criticality} />
              </td>
              <td className="hidden px-4 py-3 sm:table-cell">
                <AssetMonitoringBadge status={asset.monitoringStatus} />
              </td>
              <td className="hidden px-4 py-3 lg:table-cell">
                <AssetAuthorizationBadge status={asset.authorizationStatus} />
              </td>
              <td className="hidden px-4 py-3 text-muted xl:table-cell">
                {asset.lastSecurityCheckAt
                  ? formatDate(asset.lastSecurityCheckAt)
                  : "Never"}
              </td>
              <td className="px-4 py-3">
                <SecurityScoreIndicator score={asset.securityScore} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
