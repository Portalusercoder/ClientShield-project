import { ExecutiveDashboard } from "@/components/dashboard/executive/executive-dashboard";
import { requireSession } from "@/lib/auth";
import { getExecutiveDashboard } from "@/services/dashboard/executive-dashboard.service";

export const dynamic = "force-dynamic";

export default async function ExecutiveDashboardPage() {
  const session = await requireSession();
  const data = await getExecutiveDashboard({
    organizationId: session.organizationId,
  });

  return <ExecutiveDashboard data={data} />;
}
