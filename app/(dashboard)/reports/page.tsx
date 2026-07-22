import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportsPageClient } from "@/components/reports/reports-page-client";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { listReports } from "@/services/reports/report.service";
import type { ReportStatus, ReportType } from "@prisma/client";

export const metadata: Metadata = {
  title: "Reports",
};

export const dynamic = "force-dynamic";

interface ReportsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  const clientId =
    typeof params.clientId === "string" ? params.clientId : "ALL";
  const reportType =
    typeof params.reportType === "string" ? params.reportType : "ALL";
  const status = typeof params.status === "string" ? params.status : "ALL";

  const data = await listReports(session.organizationId, {
    clientId,
    reportType: reportType as ReportType | "ALL",
    status: status as ReportStatus | "ALL",
  });

  return (
    <Suspense fallback={<div className="text-sm text-muted">Loading…</div>}>
      <ReportsPageClient
        reports={data.reports}
        total={data.total}
        clients={data.clients}
        canGenerate={hasMinimumRole(session, "ANALYST")}
        canArchive={hasMinimumRole(session, "ADMIN")}
        currentClientId={clientId}
        currentType={reportType}
        currentStatus={status}
      />
    </Suspense>
  );
}
