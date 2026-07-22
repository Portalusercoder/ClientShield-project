import { StatCard } from "@/components/dashboard/stat-card";
import {
  ClientsAttentionList,
  RecentActivityList,
  RecentFindingsList,
  RecentIncidentsList,
  RecentSecurityEventsList,
  RemediationPerformance,
} from "@/components/dashboard/dashboard-sections";
import { SeverityDistributionChart } from "@/components/dashboard/severity-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getOrganizationId } from "@/lib/auth";
import { getDashboardData } from "@/services/dashboard.service";

// TODO: Remove force-dynamic once auth provider supports static session resolution.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  // TODO: Enforce authentication before rendering dashboard.
  const organizationId = await getOrganizationId();
  const data = await getDashboardData(organizationId);
  const { stats, caseMetrics, investigationMetrics } = data;

  function formatMeanMs(ms: number | null): string {
    if (ms == null) return "N/A";
    const hours = ms / 3_600_000;
    if (hours < 48) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-accent/30 bg-accent/5 px-4 py-3">
        <p className="text-sm text-foreground">
          <span className="font-medium">Partial Live Data</span>
          <span className="text-muted">
            {" "}
            — Vulnerability Findings, Security Events, Incidents, clients,
            assets, and security posture are loaded from PostgreSQL. Severity
            chart (findings mock), clients attention, activity, and remediation
            metrics remain partially mock where noted.
          </span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Total Clients" value={stats.totalClients} />
        <StatCard label="Assets Monitored" value={stats.assetsMonitored} />
        <StatCard
          label="Critical Vulnerabilities"
          value={stats.criticalVulnerabilities}
          variant="critical"
        />
        <StatCard
          label="High Vulnerabilities"
          value={stats.highVulnerabilities}
          variant="high"
        />
        <StatCard
          label="Open Incidents"
          value={stats.openIncidents}
          variant="warning"
        />
        <StatCard
          label="New Security Events"
          value={stats.newSecurityEvents}
          variant="warning"
        />
        <StatCard
          label="Critical Events"
          value={stats.criticalSecurityEvents}
          variant="critical"
        />
        <StatCard
          label="High Events"
          value={stats.highSecurityEvents}
          variant="high"
        />
        <StatCard
          label="Unmapped Events"
          value={stats.unmappedSecurityEvents}
        />
        <StatCard
          label="Avg Security Posture"
          value={
            stats.averageSecurityScore != null
              ? stats.averageSecurityScore
              : "—"
          }
          suffix={
            stats.averageSecurityScore != null
              ? `/ 100 · ${stats.assetsAssessed}/${stats.assetsTotal} assessed`
              : ` · ${stats.assetsAssessed}/${stats.assetsTotal} assessed`
          }
          variant="success"
        />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Incident Cases
        </h2>
        <p className="mb-4 text-sm text-muted">
          Case-management metrics — distinct from Findings and Security Events.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <StatCard
            label="Open Cases"
            value={caseMetrics.openCases}
            variant="warning"
          />
          <StatCard
            label="Critical / High Open"
            value={caseMetrics.criticalHighOpen}
            variant="critical"
          />
          <StatCard
            label="Investigating"
            value={caseMetrics.investigating}
          />
          <StatCard label="Containment" value={caseMetrics.containment} />
          <StatCard label="Recovery" value={caseMetrics.recovery} />
          <StatCard
            label="Overdue Tasks"
            value={caseMetrics.overdueTasks}
            variant="high"
          />
          <StatCard
            label="MTTA"
            value={formatMeanMs(caseMetrics.meanTimeToAcknowledgeMs)}
          />
          <StatCard
            label="MTTC"
            value={formatMeanMs(caseMetrics.meanTimeToContainMs)}
          />
          <StatCard
            label="MTTR"
            value={formatMeanMs(caseMetrics.meanTimeToResolveMs)}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Security Events (SOC)
        </h2>
        <p className="mb-4 text-sm text-muted">
          Live detection metrics — separate from Vulnerability Findings and
          Incidents.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <StatCard
            label="Security Events — Last 24h"
            value={stats.securityEventsLast24h}
          />
          <StatCard
            label="Actionable Events"
            value={stats.actionableSecurityEvents}
            variant="warning"
          />
          <StatCard
            label="Events Under Review"
            value={stats.securityEventsUnderReview}
          />
          <StatCard
            label="Escalated Events"
            value={stats.escalatedSecurityEvents}
            variant="high"
          />
          <StatCard
            label="Critical / High Events"
            value={stats.criticalHighSecurityEvents}
            variant="critical"
          />
          <StatCard
            label="Noisy / Filtered"
            value={stats.noisyFilteredSecurityEvents}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Investigations
        </h2>
        <p className="mb-4 text-sm text-muted">
          Event-grouping and correlation review — separate from Findings,
          Security Events, and Incidents.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <StatCard
            label="Open Investigations"
            value={investigationMetrics.open}
            variant="warning"
          />
          <StatCard
            label="Investigating"
            value={investigationMetrics.investigating}
          />
          <StatCard
            label="System Suggested"
            value={investigationMetrics.systemSuggestedOpen}
            variant="warning"
          />
          <StatCard
            label="Confirmed"
            value={investigationMetrics.confirmed}
          />
          <StatCard
            label="Linked to Incident"
            value={investigationMetrics.linkedToIncident}
            variant="high"
          />
          <StatCard label="Total Investigations" value={investigationMetrics.total} />
          <StatCard
            label="Malicious Indicators"
            value={
              investigationMetrics.maliciousIndicators == null
                ? "N/A"
                : investigationMetrics.maliciousIndicators
            }
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Security Event Severity (24h)</CardTitle>
            <CardDescription>
              Live distribution of Security Events by severity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.securityEventSeverityDistribution.length === 0 ? (
              <p className="text-muted">No security events in the last 24h.</p>
            ) : (
              data.securityEventSeverityDistribution.map((row) => (
                <div
                  key={row.severity}
                  className="flex items-center justify-between border-b border-border/50 py-1.5"
                >
                  <span className="text-muted">{row.severity}</span>
                  <span className="font-medium text-foreground">{row.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Wazuh Rules — Last 24h</CardTitle>
            <CardDescription>Most frequent correlated detections</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.topWazuhRules.length === 0 ? (
              <p className="text-muted">No rule activity in the last 24h.</p>
            ) : (
              data.topWazuhRules.map((r) => (
                <div
                  key={r.ruleId}
                  className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5"
                >
                  <span className="truncate text-muted">
                    {r.ruleId} — {r.title}
                  </span>
                  <span className="shrink-0 font-medium text-foreground">
                    {r.count}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Affected Assets — Last 24h</CardTitle>
            <CardDescription>
              Assets with the most Security Event activity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.topAffectedAssets.length === 0 ? (
              <p className="text-muted">No asset activity in the last 24h.</p>
            ) : (
              data.topAffectedAssets.map((a, idx) => (
                <div
                  key={a.assetId ?? `unmapped-${idx}`}
                  className="flex items-center justify-between border-b border-border/50 py-1.5"
                >
                  <span className="text-muted">{a.assetName}</span>
                  <span className="font-medium text-foreground">{a.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vulnerability Severity Distribution</CardTitle>
            <CardDescription>
              Breakdown of open findings by severity level
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SeverityDistributionChart data={data.severityDistribution} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clients Requiring Attention</CardTitle>
            <CardDescription>
              Clients with low security scores or critical findings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ClientsAttentionList clients={data.clientsRequiringAttention} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Security Findings</CardTitle>
            <CardDescription>Latest vulnerability detections</CardDescription>
          </CardHeader>
          <CardContent>
            <RecentFindingsList findings={data.recentFindings} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Incidents</CardTitle>
            <CardDescription>
              Latest security incident response activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecentIncidentsList incidents={data.recentIncidents} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Security Events</CardTitle>
            <CardDescription>
              Latest normalized Wazuh telemetry for analyst review
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecentSecurityEventsList events={data.recentSecurityEvents} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Security Activity</CardTitle>
            <CardDescription>Audit trail of recent platform events</CardDescription>
          </CardHeader>
          <CardContent>
            <RecentActivityList activities={data.recentActivity} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Remediation Performance</CardTitle>
          <CardDescription>
            Task completion metrics and resolution trends
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RemediationPerformance metrics={data.remediationMetrics} />
        </CardContent>
      </Card>
    </div>
  );
}
