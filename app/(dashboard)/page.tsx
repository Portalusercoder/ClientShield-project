import { SocAnalystDashboard } from "@/components/dashboard/soc/soc-analyst-dashboard";
import { requireSession } from "@/lib/auth";
import { getSocAnalystDashboard } from "@/services/dashboard/soc-dashboard.service";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const session = await requireSession();
  const data = await getSocAnalystDashboard({
    organizationId: session.organizationId,
    userId: session.userId,
  });

  return <SocAnalystDashboard data={data} />;
}
