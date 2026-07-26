import {
  MyWorkSection,
  OverviewMetricGrid,
} from "@/components/dashboard/soc/my-work-section";
import { NotificationsSection } from "@/components/dashboard/soc/notifications-section";
import {
  RecentFindingsTable,
  RecentIncidentsTable,
  RecentInvestigationsTable,
  RecentSecurityEventsTable,
} from "@/components/dashboard/soc/recent-tables";
import { SystemHealthSection } from "@/components/dashboard/soc/system-health-section";
import { formatMeanMs } from "@/services/dashboard/dashboard-aggregates";
import type { SocAnalystDashboardData } from "@/types/soc-dashboard";

export function SocAnalystDashboard({
  data,
}: {
  data: SocAnalystDashboardData;
}) {
  const { sla, securityEvents, investigations, incidents, findings } = data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          SOC Analyst Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted">
          Actionable work, operational health, and recent activity for your
          organization.
        </p>
      </div>

      <MyWorkSection cards={data.myWork} />

      <OverviewMetricGrid
        title="SLA Overview"
        description={
          sla.hasSlaPolicies
            ? "Contractual incident SLA (HIGH/CRITICAL open cases). At Risk = APPROACHING; Within SLA = ON_TRACK."
            : "No enabled SLA policies — counts stay at zero until policies exist."
        }
        metrics={[
          {
            label: "At Risk",
            value: sla.atRisk,
            variant: "warning",
            href: "/attention?sla=APPROACHING",
          },
          {
            label: "Breached",
            value: sla.breached,
            variant: "critical",
            href: "/attention?sla=BREACHED",
          },
          {
            label: "Within SLA",
            value: sla.withinSla,
            variant: "success",
            href: "/attention?sla=ON_TRACK",
          },
          {
            label: "Upcoming Escalations",
            value: sla.upcomingEscalations,
            variant: "high",
            href: "/notifications?filter=SLA",
          },
        ]}
      />

      <OverviewMetricGrid
        title="Security Events"
        description="Detection pipeline summary"
        metrics={[
          {
            label: "New Today",
            value: securityEvents.newToday,
            href: "/security-events",
          },
          {
            label: "Untriaged",
            value: securityEvents.untriaged,
            variant: "warning",
            href: "/security-events?status=NEW",
          },
          {
            label: "Escalated",
            value: securityEvents.escalated,
            variant: "high",
            href: "/security-events?status=ESCALATED",
          },
          {
            label: "Converted to Investigations",
            value: securityEvents.convertedToInvestigations,
            href: "/investigations",
          },
        ]}
      />

      <OverviewMetricGrid
        title="Investigations"
        metrics={[
          {
            label: "Open",
            value: investigations.open,
            variant: "warning",
            href: "/investigations",
          },
          {
            label: "Pending",
            value: investigations.pending,
            href: "/investigations?status=PENDING",
          },
          {
            label: "Resolved Today",
            value: investigations.resolvedToday,
            variant: "success",
          },
          {
            label: "Recently Updated",
            value: investigations.recentlyUpdated.length,
            href: "/investigations",
          },
        ]}
      />

      <OverviewMetricGrid
        title="Incidents"
        metrics={[
          {
            label: "Open",
            value: incidents.open,
            variant: "warning",
            href: "/incidents",
          },
          {
            label: "Critical",
            value: incidents.critical,
            variant: "critical",
            href: "/incidents?severity=CRITICAL",
          },
          {
            label: "Resolved Today",
            value: incidents.resolvedToday,
            variant: "success",
          },
          {
            label: "Mean Resolution Time",
            value: formatMeanMs(incidents.meanResolutionTimeMs),
          },
        ]}
      />

      <OverviewMetricGrid
        title="Findings"
        metrics={[
          {
            label: "Open",
            value: findings.open,
            variant: "warning",
            href: "/vulnerabilities",
          },
          {
            label: "Critical",
            value: findings.critical,
            variant: "critical",
            href: "/vulnerabilities?severity=CRITICAL",
          },
          {
            label: "Resolved",
            value: findings.resolved,
            variant: "success",
          },
          {
            label: "Newest",
            value: findings.newest.length,
            href: "/vulnerabilities",
          },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <RecentSecurityEventsTable rows={securityEvents.recent} />
        <RecentInvestigationsTable rows={investigations.recentlyUpdated} />
        <RecentIncidentsTable rows={incidents.recent} />
        <RecentFindingsTable rows={findings.recent} />
        <RecentFindingsTable
          rows={findings.newest}
          title="Newest Findings"
          description="Most recently first-detected findings"
        />
      </div>

      <NotificationsSection
        unreadCount={data.notifications.unreadCount}
        recent={data.notifications.recent}
      />

      <SystemHealthSection health={data.systemHealth} />
    </div>
  );
}
