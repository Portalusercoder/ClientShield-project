import type { Metadata } from "next";
import { Suspense } from "react";
import { InvestigationsPageClient } from "@/components/investigations/investigations-page-client";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { investigationFiltersSchema } from "@/lib/validations/investigations";
import {
  getInvestigationMetrics,
  listInvestigations,
} from "@/services/investigations/investigation.service";

export const metadata: Metadata = {
  title: "Investigations",
};

export const dynamic = "force-dynamic";

interface InvestigationsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function InvestigationsPage({
  searchParams,
}: InvestigationsPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  const statusRaw =
    typeof params.status === "string" ? params.status : undefined;
  const createdByRaw =
    typeof params.createdByType === "string"
      ? params.createdByType
      : undefined;
  const pageRaw = typeof params.page === "string" ? params.page : "1";

  const parsed = investigationFiltersSchema.safeParse({
    status: statusRaw && statusRaw !== "ALL" ? statusRaw : undefined,
    createdByType:
      createdByRaw && createdByRaw !== "ALL" ? createdByRaw : undefined,
    page: pageRaw,
    pageSize: 25,
  });

  const filters = parsed.success
    ? parsed.data
    : { page: 1, pageSize: 25 as const };

  const [{ items, total }, metrics] = await Promise.all([
    listInvestigations(session.organizationId, filters),
    getInvestigationMetrics(session.organizationId),
  ]);

  return (
    <Suspense
      fallback={
        <div className="text-sm text-muted">Loading investigations…</div>
      }
    >
      <InvestigationsPageClient
        items={items}
        total={total}
        page={filters.page}
        pageSize={filters.pageSize}
        metrics={metrics}
        currentStatus={statusRaw ?? "ALL"}
        currentCreatedByType={createdByRaw ?? "ALL"}
        canCreate={hasMinimumRole(session, "ANALYST")}
      />
    </Suspense>
  );
}
