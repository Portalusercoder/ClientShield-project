import Link from "next/link";
import { StatCard } from "@/components/dashboard/stat-card";
import { DistributionBars } from "@/components/analytics/distribution-bars";
import { KpiTrendCard } from "@/components/analytics/kpi-trend-card";
import { NamedCountList } from "@/components/analytics/named-count-list";
import { Sparkline } from "@/components/analytics/sparkline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  formatDurationMs,
  formatPct,
} from "@/services/analytics/shared";
import type {
  AnalyticsRangeDays,
  SecurityAnalyticsData,
} from "@/types/analytics";

function TrendCard({
  title,
  description,
  points,
  tone,
  footer,
}: {
  title: string;
  description?: string;
  points: SecurityAnalyticsData["incidents"]["createdSeries"];
  tone?: "accent" | "success" | "warning" | "danger";
  footer?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <Sparkline points={points} tone={tone} />
        {footer && <p className="mt-2 text-xs text-muted">{footer}</p>}
      </CardContent>
    </Card>
  );
}

function RangeSelector({ current }: { current: AnalyticsRangeDays }) {
  const options: AnalyticsRangeDays[] = [7, 30, 90];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((days) => {
        const active = days === current;
        return (
          <Link
            key={days}
            href={`/analytics?range=${days}`}
            className={
              active
                ? "rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent"
                : "rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-muted hover:text-foreground"
            }
          >
            {days} days
          </Link>
        );
      })}
    </div>
  );
}

export function AnalyticsDashboard({ data }: { data: SecurityAnalyticsData }) {
  const { kpis, incidents, investigations, findings, securityEvents, sla, risk, analysts } =
    data;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Security Analytics
          </h1>
          <p className="mt-1 text-sm text-muted">
            On-demand historical insights for MTTD/MTTA/MTTR, SOC throughput,
            posture, and client risk — computed from live domain timestamps.
          </p>
        </div>
        <RangeSelector current={data.rangeDays} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-foreground">Security KPIs</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <KpiTrendCard
            title="Mean Time To Detect"
            description="detectedAt − occurredAt (when occurredAt is known)"
            metric={kpis.mttd}
          />
          <KpiTrendCard
            title="Mean Time To Acknowledge"
            description="acknowledgedAt − detectedAt"
            metric={kpis.mtta}
          />
          <KpiTrendCard
            title="Mean Time To Resolve"
            description="resolvedAt − detectedAt"
            metric={kpis.mttr}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-foreground">Incidents</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Created" value={incidents.totals.created} />
          <StatCard label="Resolved" value={incidents.totals.resolved} />
          <StatCard
            label="Critical created"
            value={incidents.totals.criticalCreated}
            variant="critical"
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <TrendCard
            title="Incidents created"
            points={incidents.createdSeries}
            footer={`Total ${incidents.totals.created}`}
          />
          <TrendCard
            title="Incidents resolved"
            points={incidents.resolvedSeries}
            tone="success"
          />
          <TrendCard
            title="Critical incidents"
            points={incidents.criticalSeries}
            tone="danger"
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Severity distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <DistributionBars rows={incidents.severityDistribution} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open incident age</CardTitle>
            </CardHeader>
            <CardContent>
              <DistributionBars rows={incidents.ageDistribution} />
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top categories</CardTitle>
            </CardHeader>
            <CardContent>
              <NamedCountList rows={incidents.topCategories} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top affected assets</CardTitle>
            </CardHeader>
            <CardContent>
              <NamedCountList
                rows={incidents.topAssets}
                hrefFor={(r) => (r.id ? `/assets/${r.id}` : null)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top affected clients</CardTitle>
            </CardHeader>
            <CardContent>
              <NamedCountList
                rows={incidents.topClients}
                hrefFor={(r) => (r.id ? `/clients/${r.id}` : null)}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-foreground">Investigations</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Started" value={investigations.started} />
          <StatCard label="Completed" value={investigations.completed} />
          <StatCard
            label="Avg duration"
            value={formatDurationMs(investigations.averageDurationMs)}
          />
          <StatCard
            label="Completion rate"
            value={formatPct(investigations.completionRate)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Median duration"
            value={formatDurationMs(investigations.medianDurationMs)}
          />
          <StatCard label="Backlog growth" value={investigations.backlogGrowth} />
          <StatCard
            label="Avg per analyst"
            value={
              investigations.averagePerAnalyst == null
                ? "N/A"
                : investigations.averagePerAnalyst
            }
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <TrendCard title="Started" points={investigations.startedSeries} />
          <TrendCard
            title="Completed"
            points={investigations.completedSeries}
            tone="success"
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Analyst throughput</CardTitle>
            </CardHeader>
            <CardContent>
              <NamedCountList rows={investigations.analystThroughput} />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-foreground">Findings</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="New" value={findings.newFindings} />
          <StatCard label="Resolved" value={findings.resolvedFindings} />
          <StatCard
            label="Remediation rate"
            value={formatPct(findings.remediationRate)}
          />
          <StatCard
            label="Avg open age"
            value={formatDurationMs(findings.averageAgeMs)}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <TrendCard title="New findings" points={findings.newSeries} />
          <TrendCard
            title="Resolved findings"
            points={findings.resolvedSeries}
            tone="success"
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Severity</CardTitle>
            </CardHeader>
            <CardContent>
              <DistributionBars rows={findings.severityDistribution} />
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Oldest open findings</CardTitle>
            </CardHeader>
            <CardContent>
              {findings.oldestFindings.length === 0 ? (
                <EmptyState
                  title="No open findings"
                  description="Nothing currently unresolved."
                />
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {findings.oldestFindings.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-start justify-between gap-3 py-2"
                    >
                      <Link
                        href={`/vulnerabilities/${f.id}`}
                        className="truncate text-accent hover:underline"
                      >
                        {f.title}
                      </Link>
                      <span className="shrink-0 text-xs text-muted">
                        {f.severity} · {formatDurationMs(f.ageMs)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top recurring types</CardTitle>
            </CardHeader>
            <CardContent>
              <NamedCountList rows={findings.topRecurringTypes} />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-foreground">Security events</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Ingested" value={securityEvents.ingested} />
          <StatCard
            label="Converted to investigations"
            value={securityEvents.convertedToInvestigations}
          />
          <StatCard
            label="Alert→investigation"
            value={formatPct(securityEvents.alertToInvestigationRatio)}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <TrendCard
            title="Events ingested"
            points={securityEvents.ingestedSeries}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Severity</CardTitle>
            </CardHeader>
            <CardContent>
              <DistributionBars rows={securityEvents.severityDistribution} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top sources</CardTitle>
            </CardHeader>
            <CardContent>
              <NamedCountList rows={securityEvents.topSources} />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top assets</CardTitle>
          </CardHeader>
          <CardContent>
            <NamedCountList
              rows={securityEvents.topAssets}
              hrefFor={(r) => (r.id ? `/assets/${r.id}` : null)}
            />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-foreground">SLA</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Compliance (open)"
            value={formatPct(sla.currentCompliancePct)}
            variant="success"
          />
          <StatCard
            label="Breached open"
            value={sla.breachedOpen}
            variant="critical"
          />
          <StatCard label="At risk open" value={sla.atRiskOpen} variant="warning" />
          <StatCard
            label="Resolved before breach"
            value={formatPct(sla.resolutionBeforeBreachPct)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Avg response"
            value={formatDurationMs(sla.averageResponseTimeMs)}
          />
          <StatCard
            label="Avg resolution"
            value={formatDurationMs(sla.averageResolutionTimeMs)}
          />
          <StatCard label="Escalation events" value={sla.escalationFrequency} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <TrendCard
            title="Compliance trend (% met)"
            points={sla.complianceTrend}
            tone="success"
          />
          <TrendCard
            title="Breach escalations"
            points={sla.breachTrend}
            tone="danger"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-foreground">Risk & posture</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <TrendCard
            title="Security posture trend"
            description="Org score snapshots when available; otherwise live posture fill"
            points={risk.postureTrend}
          />
          <TrendCard
            title="Risk score trend"
            description="Average asset/client score snapshots"
            points={risk.riskScoreTrend}
            tone="warning"
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <TrendCard
            title="Critical findings"
            points={risk.criticalFindingsSeries}
            tone="danger"
          />
          <TrendCard
            title="Critical incidents"
            points={risk.criticalIncidentsSeries}
            tone="danger"
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Highest risk clients</CardTitle>
            </CardHeader>
            <CardContent>
              {risk.highestRiskClients.length === 0 ? (
                <p className="text-sm text-muted">No clients</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {risk.highestRiskClients.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between py-2"
                    >
                      <Link
                        href={`/clients/${c.id}`}
                        className="text-accent hover:underline"
                      >
                        {c.name}
                      </Link>
                      <span className="tabular-nums text-muted">
                        {c.securityScore ?? "N/A"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Highest risk assets</CardTitle>
            </CardHeader>
            <CardContent>
              {risk.highestRiskAssets.length === 0 ? (
                <p className="text-sm text-muted">No assets</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {risk.highestRiskAssets.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between py-2"
                    >
                      <Link
                        href={`/assets/${a.id}`}
                        className="text-accent hover:underline"
                      >
                        {a.name}
                      </Link>
                      <span className="tabular-nums text-muted">
                        {a.securityScore ?? "N/A"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-foreground">
          Analyst performance
        </h2>
        {analysts.leaderboard.length === 0 ? (
          <EmptyState
            title="No analysts"
            description="Active OWNER/ADMIN/ANALYST users will appear here."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated text-xs uppercase tracking-wider text-muted">
                  <th className="px-3 py-2 font-medium">Analyst</th>
                  <th className="px-3 py-2 font-medium">Open</th>
                  <th className="px-3 py-2 font-medium">Inv done</th>
                  <th className="px-3 py-2 font-medium">Inc done</th>
                  <th className="px-3 py-2 font-medium">Avg resolve</th>
                  <th className="px-3 py-2 font-medium">Avg inv</th>
                  <th className="px-3 py-2 font-medium">SLA %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {analysts.leaderboard.map((row) => (
                  <tr key={row.userId} className="bg-surface">
                    <td className="px-3 py-2 font-medium text-foreground">
                      {row.name}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.openWorkload}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.completedInvestigations}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.completedIncidents}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted">
                      {formatDurationMs(row.averageResolutionTimeMs)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted">
                      {formatDurationMs(row.averageInvestigationDurationMs)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatPct(row.slaCompliancePct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-muted">
        Generated {new Date(data.generatedAt).toLocaleString()} · Range{" "}
        {data.rangeDays}d · On-demand (not cached)
      </p>
    </div>
  );
}
