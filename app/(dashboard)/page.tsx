import { redirect } from "next/navigation";
import { SocAnalystDashboard } from "@/components/dashboard/soc/soc-analyst-dashboard";
import { requireSession } from "@/lib/auth";
import { defaultHomeForRole } from "@/lib/nav/ia";
import { getSocAnalystDashboard } from "@/services/dashboard/soc-dashboard.service";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const session = await requireSession();
  const home = defaultHomeForRole(session.role);
  if (home !== "/") {
    redirect(home);
  }

  const data = await getSocAnalystDashboard({
    organizationId: session.organizationId,
    userId: session.userId,
  });

  return <SocAnalystDashboard data={data} />;
}
