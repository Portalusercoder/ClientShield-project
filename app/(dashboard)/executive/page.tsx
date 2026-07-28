import { Suspense } from "react";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { ExecutiveDashboard } from "@/components/dashboard/executive/executive-dashboard";
import { requireSession } from "@/lib/auth";
import {
  getSecurityAnalytics,
  parseRangeDays,
} from "@/services/analytics/analytics.service";
import { getExecutiveDashboard } from "@/services/dashboard/executive-dashboard.service";

export const dynamic = "force-dynamic";

interface ExecutiveDashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExecutiveDashboardPage({
  searchParams,
}: ExecutiveDashboardPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const view = typeof params.view === "string" ? params.view : "now";

  if (view === "analytics") {
    const rangeRaw =
      typeof params.range === "string" ? params.range : undefined;
    const data = await getSecurityAnalytics({
      organizationId: session.organizationId,
      rangeDays: parseRangeDays(rangeRaw),
    });

    return (
      <Suspense
        fallback={
          <div className="text-sm text-muted">Loading analytics...</div>
        }
      >
        <AnalyticsDashboard data={data} embedded />
      </Suspense>
    );
  }

  const data = await getExecutiveDashboard({
    organizationId: session.organizationId,
  });

  return <ExecutiveDashboard data={data} />;
}
