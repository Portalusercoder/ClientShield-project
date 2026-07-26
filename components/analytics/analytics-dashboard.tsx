"use client";

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
import { DashboardCustomize } from "@/components/ui/dashboard-customize";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  useDashboardLayout,
  type DashboardSectionDef,
} from "@/hooks/use-dashboard-layout";
import {
  formatDurationMs,
  formatPct,
} from "@/services/analytics/shared";
import type {
  AnalyticsRangeDays,
  SecurityAnalyticsData,
} from "@/types/analytics";

const ANALYTICS_SECTIONS = [
  {
    id: "responseSpeed",
    label: "Response speed (MTTD / MTTA / MTTR)",
    defaultVisible: true,
  },
  {
    id: "sla",
    label: "SLA performance",
    defaultVisible: true,
  },
  {
    id: "incidents",
    label: "Incident throughput",
    defaultVisible: true,
  },
  {
    id: "investigations",
    label: "Investigation throughput",
    defaultVisible: false,
  },
  {
    id: "findings",
    label: "Findings remediation",
    defaultVisible: false,
  },
  {
    id: "securityEvents",
    label: "Detection conversion",
    defaultVisible: false,
  },
  {
    id: "risk",
    label: "Risk & posture",
    defaultVisible: true,
  },
  {
    id: "analysts",
    label: "Analyst performance",
    defaultVisible: false,
  },
] as const satisfies readonly DashboardSectionDef<string>[];

type AnalyticsSectionId = (typeof ANALYTICS_SECTIONS)[number]["id"];

const STORAGE_KEY = "cs-analytics-layout-v1";

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
    <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
      {options.map((days) => {
        const active = days === current;
        return (
          <Link
            key={days}
            href={`/analytics?range=${days}`}
            className={
              active
                ? "inline-flex h-9 items-center rounded-[6px] border border-accent bg-accent-muted px-3 text-sm font-medium text-accent"
                : "inline-flex h-9 items-center rounded-[6px] border border-border bg-surface px-3 text-sm font-medium text-muted shadow-sm hover:bg-surface-elevated hover:text-foreground"
            }
            aria-current={active ? "true" : undefined}
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
  const layout = useDashboardLayout<AnalyticsSectionId>(
    STORAGE_KEY,
    ANALYTICS_SECTIONS
  );
  const { isVisible } = layout;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Analytics"
        description="Are detection and response getting faster — and is SLA holding — over the selected range? Customize to keep only the sections you need."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DashboardCustomize
              title="Customize Analytics"
              sections={ANALYTICS_SECTIONS}
              isVisible={layout.isVisible}
              setSection={layout.setSection}
              setAll={layout.setAll}
              reset={layout.reset}
              hiddenCount={layout.hiddenCount}
            />
            <RangeSelector current={data.rangeDays} />
          </div>
        }
      />

      {layout.hiddenCount > 0 ? (
        <p className="rounded-[8px] border border-border bg-surface-elevated/60 px-4 py-2.5 text-sm text-muted">
          {layout.hiddenCount} section
          {layout.hiddenCount !== 1 ? "s are" : " is"} hidden. Use{" "}
          <span className="font-medium text-foreground">Customize</span> to add
          them back, or{" "}
          <button
            type="button"
            className="font-medium text-accent hover:underline"
            onClick={() => layout.setAll(true)}
          >
            show all
          </button>
          .
        </p>
      ) : null}

      {isVisible("responseSpeed") ? (
      <section className="space-y-3">
        <SectionHeader
          title="Response speed"
          description="Primary performance question for this range: MTTD, MTTA, and MTTR."
        />
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
      ) : null}

      {isVisible("sla") ? (
      <section className="space-y-3">
        <SectionHeader
          title="SLA performance"
          description="Compliance and breach pressure for open and resolved cases."
        />
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
          <StatCard
            label="At risk open"
            value={sla.atRiskOpen}
            variant="warning"
          />
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
      ) : null}

      {isVisible("incidents") ? (
      <section className="space-y-3">
        <SectionHeader
          title="Incident throughput"
          description="Creation vs resolution volume for the selected window."
        />
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
      ) : null}

      {isVisible("investigations") ? (
      <section className="space-y-3">
        <SectionHeader
          title="Investigation throughput"
          description="Start/complete rates and backlog pressure."
        />
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
      ) : null}

      {isVisible("findings") ? (
      <section className="space-y-3">
        <SectionHeader
          title="Findings remediation"
          description="New vs resolved findings and aging debt."
        />
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
      ) : null}

      {isVisible("securityEvents") ? (
      <section className="space-y-3">
        <SectionHeader
          title="Detection conversion"
          description="Ingested events and escalation into investigations."
        />
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
      ) : null}

      {isVisible("risk") ? (
      <section className="space-y-3">
        <SectionHeader
          title="Risk & posture"
          description="Score trends and highest-risk clients and assets."
        />
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
      ) : null}

      {isVisible("analysts") ? (
      <section className="space-y-3">
        <SectionHeader
          title="Analyst performance"
          description="Workload and completion rates — last section for coaching context."
          tone="secondary"
        />
        {analysts.leaderboard.length === 0 ? (
          <EmptyState
            title="No analysts"
            description="Active OWNER/ADMIN/ANALYST users will appear here."
          />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Analyst</Th>
                <Th>Open</Th>
                <Th>Inv done</Th>
                <Th>Inc done</Th>
                <Th>Avg resolve</Th>
                <Th>Avg inv</Th>
                <Th>SLA %</Th>
              </Tr>
            </THead>
            <TBody>
              {analysts.leaderboard.map((row) => (
                <Tr key={row.userId}>
                  <Td className="font-medium">{row.name}</Td>
                  <Td className="tabular-nums">{row.openWorkload}</Td>
                  <Td className="tabular-nums">
                    {row.completedInvestigations}
                  </Td>
                  <Td className="tabular-nums">{row.completedIncidents}</Td>
                  <Td className="tabular-nums text-muted">
                    {formatDurationMs(row.averageResolutionTimeMs)}
                  </Td>
                  <Td className="tabular-nums text-muted">
                    {formatDurationMs(row.averageInvestigationDurationMs)}
                  </Td>
                  <Td className="tabular-nums">
                    {formatPct(row.slaCompliancePct)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-muted">
          Generated {new Date(data.generatedAt).toLocaleString()} · Range{" "}
          {data.rangeDays}d · On-demand (not cached)
        </p>
        {layout.hiddenCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => layout.setAll(true)}
          >
            Show all sections
          </Button>
        ) : null}
      </div>
    </div>
  );
}
