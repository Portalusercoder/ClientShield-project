import type { Metadata } from "next";
import { Suspense } from "react";
import { AssetsPageClient } from "@/components/assets/assets-page-client";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { listAssets } from "@/services/assets.service";
import type {
  AssetCriticality,
  AssetMonitoringStatus,
  AssetType,
} from "@prisma/client";

export const metadata: Metadata = {
  title: "Assets",
};

export const dynamic = "force-dynamic";

interface AssetsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AssetsPage({ searchParams }: AssetsPageProps) {
  // TODO: Enforce production IdP authentication before rendering.
  const session = await requireSession();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : undefined;
  const clientId =
    typeof params.clientId === "string" ? params.clientId : "ALL";
  const type = typeof params.type === "string" ? params.type : "ALL";
  const criticality =
    typeof params.criticality === "string" ? params.criticality : "ALL";
  const monitoringStatus =
    typeof params.monitoringStatus === "string"
      ? params.monitoringStatus
      : "ALL";
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  const add = params.add === "1" || params.add === "true";

  const data = await listAssets(session.organizationId, {
    search,
    clientId,
    type: type as AssetType | "ALL",
    criticality: criticality as AssetCriticality | "ALL",
    monitoringStatus: monitoringStatus as AssetMonitoringStatus | "ALL",
    page,
    pageSize: 20,
  });

  return (
    <Suspense
      fallback={<div className="text-sm text-muted">Loading assets...</div>}
    >
      <AssetsPageClient
        data={data}
        currentSearch={search}
        currentClientId={clientId}
        currentType={type}
        currentCriticality={criticality}
        currentMonitoringStatus={monitoringStatus}
        canCreate={hasMinimumRole(session, "ANALYST")}
        defaultClientId={clientId !== "ALL" ? clientId : undefined}
        openAddOnLoad={add && hasMinimumRole(session, "ANALYST")}
      />
    </Suspense>
  );
}
