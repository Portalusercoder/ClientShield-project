import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { parseRangeDays } from "@/services/analytics/analytics.service";

export const dynamic = "force-dynamic";

interface AnalyticsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Analytics lives under Security Posture “Over time” — preserve range via query. */
export default async function AnalyticsPage({
  searchParams,
}: AnalyticsPageProps) {
  await requireSession();
  const params = await searchParams;
  const rangeRaw =
    typeof params.range === "string" ? params.range : undefined;
  const range = parseRangeDays(rangeRaw);
  redirect(`/executive?view=analytics&range=${range}`);
}
