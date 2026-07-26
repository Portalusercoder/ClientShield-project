import { StatCard } from "@/components/dashboard/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ExecutiveKpiCards } from "@/types/executive-dashboard";

function gradeTone(grade: string): string {
  switch (grade) {
    case "A":
      return "text-success";
    case "B":
      return "text-accent";
    case "C":
      return "text-warning";
    case "D":
      return "text-severity-high";
    default:
      return "text-severity-critical";
  }
}

export function ExecutiveKpiSection({ kpis }: { kpis: ExecutiveKpiCards }) {
  const { posture } = kpis;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Executive KPIs</h2>
        <p className="text-sm text-muted">
          Organization-wide posture and volume — not an analyst work queue.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Clients" value={kpis.totalClients} />
        <StatCard label="Total Assets" value={kpis.totalAssets} />
        <StatCard
          label="Active Investigations"
          value={kpis.activeInvestigations}
          variant="warning"
        />
        <StatCard
          label="Open Incidents"
          value={kpis.openIncidents}
          variant="warning"
        />
        <StatCard
          label="Critical Findings"
          value={kpis.criticalFindings}
          variant="critical"
        />
        <StatCard
          label="Open Security Events"
          value={kpis.openSecurityEvents}
          variant="high"
        />
        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Overall Security Posture</CardTitle>
            <CardDescription>
              Transparent weighted score from critical incidents/findings, breached
              SLA, open investigations, and open security events
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">Score</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
                {posture.score}
                <span className="ml-1 text-base font-normal text-muted">/ 100</span>
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">Grade</p>
              <p
                className={`mt-1 text-3xl font-semibold ${gradeTone(posture.grade)}`}
              >
                {posture.grade}
              </p>
            </div>
            {kpis.assetPostureAverage != null ? (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted">
                  Avg asset posture
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                  {kpis.assetPostureAverage}
                </p>
              </div>
            ) : null}
            <ul className="min-w-[200px] flex-1 space-y-1 text-xs text-muted">
              <li>
                Critical incidents: {posture.factors.criticalIncidents} (−
                {posture.deductions.criticalIncidents})
              </li>
              <li>
                Critical findings: {posture.factors.criticalFindings} (−
                {posture.deductions.criticalFindings})
              </li>
              <li>
                Breached SLA: {posture.factors.breachedSla} (−
                {posture.deductions.breachedSla})
              </li>
              <li>
                Open investigations: {posture.factors.openInvestigations} (−
                {posture.deductions.openInvestigations})
              </li>
              <li>
                Open security events: {posture.factors.openSecurityEvents} (−
                {posture.deductions.openSecurityEvents})
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
