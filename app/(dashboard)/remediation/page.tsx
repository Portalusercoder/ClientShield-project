import type { Metadata } from "next";
import { Suspense } from "react";
import { RemediationPageClient } from "@/components/remediation/remediation-page-client";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { listRemediationTasks } from "@/services/remediation.service";
import type { FindingSeverity, RemediationStatus } from "@prisma/client";

export const metadata: Metadata = {
  title: "Remediation",
};

export const dynamic = "force-dynamic";

interface RemediationPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RemediationPage({
  searchParams,
}: RemediationPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : "ALL";
  const severity =
    typeof params.severity === "string" ? params.severity : "ALL";
  const assignedToUserId =
    typeof params.assignedToUserId === "string"
      ? params.assignedToUserId
      : "ALL";
  const overdueOnly =
    params.overdueOnly === "true" || params.overdueOnly === "1";
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const data = await listRemediationTasks(session.organizationId, {
    search,
    status: status as RemediationStatus | "ALL",
    severity: severity as FindingSeverity | "ALL",
    assignedToUserId,
    overdueOnly,
    page,
    pageSize: 20,
  });

  return (
    <Suspense
      fallback={
        <div className="text-sm text-muted">Loading remediation tasks...</div>
      }
    >
      <RemediationPageClient
        data={data}
        canUpdate={hasMinimumRole(session, "VIEWER")}
        currentSearch={search}
        currentStatus={status}
        currentSeverity={severity}
        currentAssignedToUserId={assignedToUserId}
        currentOverdueOnly={overdueOnly}
      />
    </Suspense>
  );
}
