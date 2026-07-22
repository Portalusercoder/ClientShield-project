import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientsPageClient } from "@/components/clients/clients-page-client";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { listClients } from "@/services/clients.service";

export const metadata: Metadata = {
  title: "Clients",
};

export const dynamic = "force-dynamic";

interface ClientsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  // TODO: Enforce production IdP authentication before rendering.
  const session = await requireSession();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : "ALL";
  const industry =
    typeof params.industry === "string" ? params.industry : "ALL";
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const data = await listClients(session.organizationId, {
    search,
    status: status as "ALL" | "ACTIVE" | "INACTIVE" | "ONBOARDING",
    industry,
    page,
    pageSize: 20,
  });

  const canCreate = hasMinimumRole(session, "ANALYST");

  return (
    <Suspense fallback={<div className="text-sm text-muted">Loading clients...</div>}>
      <ClientsPageClient
        data={data}
        currentSearch={search}
        currentStatus={status}
        currentIndustry={industry}
        canCreate={canCreate}
      />
    </Suspense>
  );
}
