import type { Metadata } from "next";
import { Suspense } from "react";
import { IncidentsPageClient } from "@/components/incidents/incidents-page-client";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { listIncidents } from "@/services/incidents.service";
import type {
  IncidentCategory,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
} from "@prisma/client";

export const metadata: Metadata = {
  title: "Incidents",
};

export const dynamic = "force-dynamic";

interface IncidentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function IncidentsPage({
  searchParams,
}: IncidentsPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : undefined;
  const caseNumber =
    typeof params.caseNumber === "string" ? params.caseNumber : undefined;
  const clientId =
    typeof params.clientId === "string" ? params.clientId : "ALL";
  const assetId = typeof params.assetId === "string" ? params.assetId : "ALL";
  const severity =
    typeof params.severity === "string" ? params.severity : "ALL";
  const status = typeof params.status === "string" ? params.status : "ALL";
  const category =
    typeof params.category === "string" ? params.category : "ALL";
  const source = typeof params.source === "string" ? params.source : "ALL";
  const assignedToUserId =
    typeof params.assignedToUserId === "string"
      ? params.assignedToUserId
      : "ALL";
  const leadAnalystUserId =
    typeof params.leadAnalystUserId === "string"
      ? params.leadAnalystUserId
      : "ALL";
  const detectedFrom =
    typeof params.detectedFrom === "string" ? params.detectedFrom : undefined;
  const detectedTo =
    typeof params.detectedTo === "string" ? params.detectedTo : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const data = await listIncidents(session.organizationId, {
    search,
    caseNumber,
    clientId,
    assetId,
    severity: severity as IncidentSeverity | "ALL",
    status: status as IncidentStatus | "ALL",
    category: category as IncidentCategory | "ALL",
    source: source as IncidentSource | "ALL",
    assignedToUserId,
    leadAnalystUserId,
    detectedFrom: detectedFrom ?? null,
    detectedTo: detectedTo ?? null,
    page,
    pageSize: 20,
    sortBy: "updatedAt",
    sortDir: "desc",
  });

  return (
    <Suspense
      fallback={<div className="text-sm text-muted">Loading incidents…</div>}
    >
      <IncidentsPageClient
        data={data}
        currentSearch={search}
        currentCaseNumber={caseNumber}
        currentClientId={clientId}
        currentAssetId={assetId}
        currentSeverity={severity}
        currentStatus={status}
        currentCategory={category}
        currentSource={source}
        currentAssignedToUserId={assignedToUserId}
        currentLeadAnalystUserId={leadAnalystUserId}
        currentDetectedFrom={detectedFrom}
        currentDetectedTo={detectedTo}
        canCreate={hasMinimumRole(session, "ANALYST")}
      />
    </Suspense>
  );
}
