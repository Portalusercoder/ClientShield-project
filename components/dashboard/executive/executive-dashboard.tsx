import { ExecutiveClientSection } from "@/components/dashboard/executive/client-section";
import { ExecutiveKpiSection } from "@/components/dashboard/executive/kpi-section";
import { ExecutiveOperationalSection } from "@/components/dashboard/executive/operational-section";
import { ExecutivePlatformHealthSection } from "@/components/dashboard/executive/platform-health-section";
import { ExecutiveRiskSection } from "@/components/dashboard/executive/risk-section";
import { ExecutiveSlaSection } from "@/components/dashboard/executive/sla-section";
import { ExecutiveTrendsSection } from "@/components/dashboard/executive/trends-section";
import type { ExecutiveDashboardData } from "@/types/executive-dashboard";

export function ExecutiveDashboard({ data }: { data: ExecutiveDashboardData }) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Executive Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted">
          Security posture, trends, and operational health for CISOs and security
          managers.
        </p>
      </div>

      <ExecutiveKpiSection kpis={data.kpis} />
      <ExecutiveTrendsSection trends={data.trends} />
      <ExecutiveRiskSection risk={data.risk} />
      <ExecutiveSlaSection sla={data.sla} />
      <ExecutiveClientSection clients={data.clients} />
      <ExecutiveOperationalSection operational={data.operational} />
      <ExecutivePlatformHealthSection health={data.platformHealth} />
    </div>
  );
}
