import { StatCard } from "@/components/dashboard/stat-card";
import { SectionHeader } from "@/components/ui/section-header";
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

/**
 * Hero answers: Is overall posture acceptable?
 * Volume KPIs support that judgment — they are not the headline.
 */
export function ExecutiveKpiSection({ kpis }: { kpis: ExecutiveKpiCards }) {
  const { posture } = kpis;

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Security posture"
        description="Single organizational score from critical exposure, SLA breaches, and open response work."
      />

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-8 p-6 lg:flex-row lg:items-stretch lg:gap-10">
          <div className="flex min-w-[200px] flex-col justify-center border-b border-border pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-10">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Overall score
            </p>
            <div className="mt-3 flex items-end gap-4">
              <p className="text-5xl font-semibold tabular-nums tracking-tight text-foreground">
                {posture.score}
                <span className="ml-1 text-lg font-normal text-muted">/100</span>
              </p>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted">
                  Grade
                </p>
                <p
                  className={`text-3xl font-semibold ${gradeTone(posture.grade)}`}
                >
                  {posture.grade}
                </p>
              </div>
            </div>
            {kpis.assetPostureAverage != null ? (
              <p className="mt-4 text-sm text-muted">
                Avg asset posture{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {kpis.assetPostureAverage}
                </span>
              </p>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <CardHeader className="p-0 pb-3">
              <CardTitle className="text-base">Score drivers</CardTitle>
              <CardDescription>
                Transparent deductions from the 100-point baseline
              </CardDescription>
            </CardHeader>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              <li className="flex justify-between gap-3 rounded-[6px] bg-surface-elevated px-3 py-2">
                <span className="text-muted">Critical incidents</span>
                <span className="tabular-nums text-foreground">
                  {posture.factors.criticalIncidents}{" "}
                  <span className="text-muted">
                    (−{posture.deductions.criticalIncidents})
                  </span>
                </span>
              </li>
              <li className="flex justify-between gap-3 rounded-[6px] bg-surface-elevated px-3 py-2">
                <span className="text-muted">Critical findings</span>
                <span className="tabular-nums text-foreground">
                  {posture.factors.criticalFindings}{" "}
                  <span className="text-muted">
                    (−{posture.deductions.criticalFindings})
                  </span>
                </span>
              </li>
              <li className="flex justify-between gap-3 rounded-[6px] bg-surface-elevated px-3 py-2">
                <span className="text-muted">Breached SLA</span>
                <span className="tabular-nums text-foreground">
                  {posture.factors.breachedSla}{" "}
                  <span className="text-muted">
                    (−{posture.deductions.breachedSla})
                  </span>
                </span>
              </li>
              <li className="flex justify-between gap-3 rounded-[6px] bg-surface-elevated px-3 py-2">
                <span className="text-muted">Open investigations</span>
                <span className="tabular-nums text-foreground">
                  {posture.factors.openInvestigations}{" "}
                  <span className="text-muted">
                    (−{posture.deductions.openInvestigations})
                  </span>
                </span>
              </li>
              <li className="flex justify-between gap-3 rounded-[6px] bg-surface-elevated px-3 py-2 sm:col-span-2">
                <span className="text-muted">Open security events</span>
                <span className="tabular-nums text-foreground">
                  {posture.factors.openSecurityEvents}{" "}
                  <span className="text-muted">
                    (−{posture.deductions.openSecurityEvents})
                  </span>
                </span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
          Supporting volume
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <StatCard label="Clients" value={kpis.totalClients} />
          <StatCard label="Assets" value={kpis.totalAssets} />
          <StatCard
            label="Active investigations"
            value={kpis.activeInvestigations}
            variant="warning"
          />
          <StatCard
            label="Open incidents"
            value={kpis.openIncidents}
            variant="warning"
          />
          <StatCard
            label="Critical findings"
            value={kpis.criticalFindings}
            variant="critical"
          />
          <StatCard
            label="Open events"
            value={kpis.openSecurityEvents}
            variant="high"
          />
        </div>
      </div>
    </section>
  );
}
