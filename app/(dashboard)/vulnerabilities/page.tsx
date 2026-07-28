import type { Metadata } from "next";
import { Suspense } from "react";
import { FindingsPageClient } from "@/components/findings/findings-page-client";
import { RemediationPageClient } from "@/components/remediation/remediation-page-client";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { listFindings } from "@/services/findings.service";
import { listRemediationTasks } from "@/services/remediation.service";
import type {
  FindingSeverity,
  FindingSource,
  FindingStatus,
  RemediationStatus,
  TriagePriority,
} from "@prisma/client";

export const metadata: Metadata = {
  title: "Findings",
};

export const dynamic = "force-dynamic";

interface VulnerabilitiesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VulnerabilitiesPage({
  searchParams,
}: VulnerabilitiesPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const view =
    typeof params.view === "string" ? params.view : "findings";

  if (view === "remediation") {
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
          canUpdate={hasMinimumRole(session, "ANALYST")}
          currentSearch={search}
          currentStatus={status}
          currentSeverity={severity}
          currentAssignedToUserId={assignedToUserId}
          currentOverdueOnly={overdueOnly}
          showPostureTabs
        />
      </Suspense>
    );
  }

  const search = typeof params.search === "string" ? params.search : undefined;
  const clientId =
    typeof params.clientId === "string" ? params.clientId : "ALL";
  const assetId = typeof params.assetId === "string" ? params.assetId : "ALL";
  const severity =
    typeof params.severity === "string" ? params.severity : "ALL";
  const status = typeof params.status === "string" ? params.status : "ALL";
  const source = typeof params.source === "string" ? params.source : "ALL";
  const triagePriority =
    typeof params.triagePriority === "string" ? params.triagePriority : "ALL";
  const needsTriage = params.needsTriage === "true";
  const assignedToUserId =
    typeof params.assignedToUserId === "string"
      ? params.assignedToUserId
      : "ALL";
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const data = await listFindings(session.organizationId, {
    search,
    clientId,
    assetId,
    severity: severity as FindingSeverity | "ALL",
    status: status as FindingStatus | "ALL",
    source: source as FindingSource | "ALL",
    triagePriority: triagePriority as TriagePriority | "ALL",
    needsTriage,
    assignedToUserId,
    page,
    pageSize: 20,
  });

  return (
    <Suspense
      fallback={<div className="text-sm text-muted">Loading findings...</div>}
    >
      <FindingsPageClient
        data={data}
        currentSearch={search}
        currentClientId={clientId}
        currentAssetId={assetId}
        currentSeverity={severity}
        currentStatus={status}
        currentSource={source}
        currentPriority={triagePriority}
        currentNeedsTriage={needsTriage}
        currentAssignedToUserId={assignedToUserId}
      />
    </Suspense>
  );
}
