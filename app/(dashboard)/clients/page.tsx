import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientsPageClient } from "@/components/clients/clients-page-client";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { listClients } from "@/services/clients.service";
import type { ClientFilters } from "@/types/client";

export const metadata: Metadata = {
  title: "Clients",
};

export const dynamic = "force-dynamic";

interface ClientsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : "ALL";
  const onboardingStatus =
    typeof params.onboardingStatus === "string"
      ? params.onboardingStatus
      : "ALL";
  const readiness =
    typeof params.readiness === "string" ? params.readiness : "ALL";
  const industry =
    typeof params.industry === "string" ? params.industry : "ALL";
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const filters: ClientFilters = {
    search,
    status: status as ClientFilters["status"],
    onboardingStatus:
      onboardingStatus as ClientFilters["onboardingStatus"],
    readiness: readiness as ClientFilters["readiness"],
    industry,
    page,
    pageSize: 20,
  };

  const data = await listClients(session.organizationId, filters);
  const canCreate = hasMinimumRole(session, "ADMIN");

  return (
    <Suspense fallback={<div className="text-sm text-muted">Loading clients...</div>}>
      <ClientsPageClient
        data={data}
        currentSearch={search}
        currentStatus={status}
        currentOnboarding={onboardingStatus}
        currentReadiness={readiness}
        currentIndustry={industry}
        canCreate={canCreate}
      />
    </Suspense>
  );
}
