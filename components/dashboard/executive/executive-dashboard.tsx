import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { ExecutiveClientSection } from "@/components/dashboard/executive/client-section";
import { ExecutiveKpiSection } from "@/components/dashboard/executive/kpi-section";
import { ExecutiveOperationalSection } from "@/components/dashboard/executive/operational-section";
import { ExecutivePlatformHealthSection } from "@/components/dashboard/executive/platform-health-section";
import { ExecutiveRiskSection } from "@/components/dashboard/executive/risk-section";
import { ExecutiveSlaSection } from "@/components/dashboard/executive/sla-section";
import { ExecutiveTrendsSection } from "@/components/dashboard/executive/trends-section";
import type { ExecutiveDashboardData } from "@/types/executive-dashboard";

/**
 * Primary question: Is the organization's security posture acceptable?
 * Order: posture → risk → SLA → clients → trends → ops (secondary)
 */
export function ExecutiveDashboard({ data }: { data: ExecutiveDashboardData }) {
  return (
    <div className="space-y-10">
      <PageHeader
        title="Security Posture"
        description="Executive view of whether risk, SLA, and exposure are within acceptable bounds."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/analytics"
              className="inline-flex h-9 items-center rounded-[6px] border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-sm hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              View trends in Analytics
            </Link>
            <Link
              href="/reports"
              className="inline-flex h-9 items-center rounded-[6px] border border-accent bg-accent px-3 text-sm font-medium text-white shadow-sm hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Generate report
            </Link>
          </div>
        }
      />

      <ExecutiveKpiSection kpis={data.kpis} />
      <ExecutiveRiskSection risk={data.risk} />
      <ExecutiveSlaSection sla={data.sla} />
      <ExecutiveClientSection clients={data.clients} />
      <ExecutiveTrendsSection trends={data.trends} />

      <section className="space-y-6 border-t border-border pt-8">
        <SectionHeader
          title="Program operations"
          description="Analyst workload and platform health — secondary to posture judgment."
          tone="secondary"
        />
        <ExecutiveOperationalSection operational={data.operational} />
        <ExecutivePlatformHealthSection health={data.platformHealth} />
      </section>
    </div>
  );
}
