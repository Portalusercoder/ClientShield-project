import { StatCard } from "@/components/dashboard/stat-card";
import { formatMeanMs } from "@/services/dashboard/dashboard-aggregates";
import type { ExecutiveSlaCompliance } from "@/types/executive-dashboard";

export function ExecutiveSlaSection({ sla }: { sla: ExecutiveSlaCompliance }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">SLA Compliance</h2>
        <p className="text-sm text-muted">
          {sla.hasSlaPolicies
            ? "Contractual HIGH/CRITICAL open incidents — reuses evaluateIncidentSla (At Risk = APPROACHING)."
            : "No enabled SLA policies — compliance stays empty until policies exist."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Compliance %"
          value={
            sla.compliancePercent == null ? "N/A" : `${sla.compliancePercent}%`
          }
          variant="success"
        />
        <StatCard label="Breached" value={sla.breached} variant="critical" />
        <StatCard label="At Risk" value={sla.atRisk} variant="warning" />
        <StatCard
          label="Avg Response Time"
          value={formatMeanMs(sla.averageResponseTimeMs)}
        />
        <StatCard
          label="Avg Resolution Time"
          value={formatMeanMs(sla.averageResolutionTimeMs)}
        />
      </div>
    </section>
  );
}
