import Link from "next/link";
import { updateAssetAuthorizationAction } from "@/app/(dashboard)/clients/actions";
import {
  AssetAuthorizationBadge,
  AssetCriticalityBadge,
  AssetMonitoringBadge,
  AssetTypeBadge,
} from "@/components/assets/asset-badges";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { AssetListItem } from "@/types/asset";

interface AssetsTabProps {
  clientId: string;
  assets: AssetListItem[];
  canManageClient: boolean;
  canCreateAsset: boolean;
  isPending: boolean;
  onAddAsset: () => void;
  runAction: (
    fn: () => Promise<{ success: boolean; error?: string }>
  ) => void;
}

export function AssetsTab({
  clientId,
  assets,
  canManageClient,
  canCreateAsset,
  isPending,
  onAddAsset,
  runAction,
}: AssetsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canCreateAsset && (
          <Button onClick={onAddAsset}>Add asset</Button>
        )}
      </div>
      {assets.length === 0 ? (
        <EmptyState
          title="No assets"
          description="Add websites, applications, or endpoints in scope for this client."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-elevated">
                <th className="px-4 py-3 font-medium text-muted">Asset</th>
                <th className="px-4 py-3 font-medium text-muted">Type</th>
                <th className="px-4 py-3 font-medium text-muted">Criticality</th>
                <th className="px-4 py-3 font-medium text-muted">Monitoring</th>
                <th className="px-4 py-3 font-medium text-muted">Authorization</th>
                {canManageClient && (
                  <th className="px-4 py-3 font-medium text-muted">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/assets/${asset.id}`}
                      className="font-medium text-foreground hover:text-accent"
                    >
                      {asset.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <AssetTypeBadge type={asset.type} />
                  </td>
                  <td className="px-4 py-3">
                    <AssetCriticalityBadge criticality={asset.criticality} />
                  </td>
                  <td className="px-4 py-3">
                    <AssetMonitoringBadge status={asset.monitoringStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <AssetAuthorizationBadge
                      status={asset.authorizationStatus}
                    />
                  </td>
                  {canManageClient && (
                    <td className="px-4 py-3">
                      {asset.authorizationStatus !== "AUTHORIZED" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isPending}
                          onClick={() =>
                            runAction(() =>
                              updateAssetAuthorizationAction(
                                asset.id,
                                clientId,
                                "AUTHORIZED"
                              )
                            )
                          }
                        >
                          Authorize
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
