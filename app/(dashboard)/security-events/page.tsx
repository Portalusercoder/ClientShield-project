import type { Metadata } from "next";
import { Suspense } from "react";
import { SecurityEventsPageClient } from "@/components/security-events/security-events-page-client";
import { requireSession } from "@/lib/auth";
import { securityEventFiltersSchema } from "@/lib/validations/security-events";
import { listSecurityEvents } from "@/services/security-events.service";

export const metadata: Metadata = {
  title: "Security Events",
};

export const dynamic = "force-dynamic";

interface SecurityEventsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function str(
  params: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = params[key];
  return typeof v === "string" ? v : undefined;
}

export default async function SecurityEventsPage({
  searchParams,
}: SecurityEventsPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  const parsed = securityEventFiltersSchema.safeParse({
    search: str(params, "search"),
    severity:
      str(params, "severity") && str(params, "severity") !== "ALL"
        ? str(params, "severity")
        : undefined,
    status:
      str(params, "status") && str(params, "status") !== "ALL"
        ? str(params, "status")
        : undefined,
    classification:
      str(params, "classification") && str(params, "classification") !== "ALL"
        ? str(params, "classification")
        : undefined,
    source:
      str(params, "source") && str(params, "source") !== "ALL"
        ? str(params, "source")
        : undefined,
    clientId:
      str(params, "clientId") && str(params, "clientId") !== "ALL"
        ? str(params, "clientId")
        : undefined,
    assetId:
      str(params, "assetId") && str(params, "assetId") !== "ALL"
        ? str(params, "assetId")
        : undefined,
    agentId: str(params, "agentId"),
    ruleId: str(params, "ruleId"),
    dateFrom: str(params, "dateFrom"),
    dateTo: str(params, "dateTo"),
    sort: str(params, "sort") === "oldest" ? "oldest" : "newest",
    page: str(params, "page") ?? 1,
    pageSize: 25,
  });

  const filters = parsed.success
    ? parsed.data
    : { page: 1, pageSize: 25 as const, sort: "newest" as const };

  const data = await listSecurityEvents(session.organizationId, filters);

  return (
    <Suspense fallback={<div className="p-6 text-muted">Loading events…</div>}>
      <SecurityEventsPageClient
        data={data}
        currentSearch={str(params, "search")}
        currentClientId={str(params, "clientId") ?? "ALL"}
        currentAssetId={str(params, "assetId") ?? "ALL"}
        currentSeverity={str(params, "severity") ?? "ALL"}
        currentStatus={str(params, "status") ?? "ALL"}
        currentClassification={str(params, "classification") ?? "ALL"}
        currentSource={str(params, "source") ?? "ALL"}
        currentAgentId={str(params, "agentId") ?? ""}
        currentRuleId={str(params, "ruleId") ?? ""}
        currentDateFrom={str(params, "dateFrom")}
        currentDateTo={str(params, "dateTo")}
        currentSort={str(params, "sort") ?? "newest"}
      />
    </Suspense>
  );
}
