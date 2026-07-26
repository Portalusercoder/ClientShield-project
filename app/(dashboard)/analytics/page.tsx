import type { Metadata } from "next";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { requireSession } from "@/lib/auth";
import {
  getSecurityAnalytics,
  parseRangeDays,
} from "@/services/analytics/analytics.service";

export const metadata: Metadata = {
  title: "Analytics",
};

export const dynamic = "force-dynamic";

interface AnalyticsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const rangeRaw =
    typeof params.range === "string" ? params.range : undefined;

  const data = await getSecurityAnalytics({
    organizationId: session.organizationId,
    rangeDays: parseRangeDays(rangeRaw),
  });

  return <AnalyticsDashboard data={data} />;
}
