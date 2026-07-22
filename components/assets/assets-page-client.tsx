"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AssetFiltersBar } from "@/components/assets/asset-filters";
import { AssetFormModal } from "@/components/assets/asset-form-modal";
import { AssetTable } from "@/components/assets/asset-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { AssetListResult } from "@/types/asset";

interface AssetsPageClientProps {
  data: AssetListResult;
  currentSearch?: string;
  currentClientId?: string;
  currentType?: string;
  currentCriticality?: string;
  currentMonitoringStatus?: string;
  canCreate: boolean;
  defaultClientId?: string;
  openAddOnLoad?: boolean;
}

export function AssetsPageClient({
  data,
  currentSearch,
  currentClientId = "ALL",
  currentType = "ALL",
  currentCriticality = "ALL",
  currentMonitoringStatus = "ALL",
  canCreate,
  defaultClientId,
  openAddOnLoad = false,
}: AssetsPageClientProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(openAddOnLoad);

  const hasFilters =
    Boolean(currentSearch) ||
    currentClientId !== "ALL" ||
    currentType !== "ALL" ||
    currentCriticality !== "ALL" ||
    currentMonitoringStatus !== "ALL";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          {data.total} asset{data.total !== 1 ? "s" : ""} registered
        </p>
        {canCreate && (
          <Button onClick={() => setAddOpen(true)} disabled={data.clients.length === 0}>
            Add Asset
          </Button>
        )}
      </div>

      {data.clients.length === 0 ? (
        <EmptyState
          title="No clients available"
          description="Add a client before registering digital assets."
        >
          <Button className="mt-4" onClick={() => router.push("/clients")}>
            Go to Clients
          </Button>
        </EmptyState>
      ) : (
        <>
          <AssetFiltersBar
            clients={data.clients}
            currentSearch={currentSearch}
            currentClientId={currentClientId}
            currentType={currentType}
            currentCriticality={currentCriticality}
            currentMonitoringStatus={currentMonitoringStatus}
          />

          {data.assets.length === 0 ? (
            <EmptyState
              title="No assets found"
              description={
                hasFilters
                  ? "No assets match your current filters. Try adjusting your search criteria."
                  : "No digital assets have been registered yet. Add your first asset to begin monitoring."
              }
            >
              {canCreate && !hasFilters && (
                <Button className="mt-4" onClick={() => setAddOpen(true)}>
                  Add Asset
                </Button>
              )}
            </EmptyState>
          ) : (
            <AssetTable assets={data.assets} />
          )}
        </>
      )}

      {addOpen && (
        <AssetFormModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          clients={data.clients}
          defaultClientId={defaultClientId}
          onSuccess={(id) => {
            router.push(`/assets/${id}`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
