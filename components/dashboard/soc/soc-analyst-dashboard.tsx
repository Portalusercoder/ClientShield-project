"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { SummaryStrip } from "@/components/ui/summary-strip";
import { DashboardCustomize } from "@/components/ui/dashboard-customize";
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
import { Button } from "@/components/ui/button";
import {
  useDashboardLayout,
  type DashboardSectionDef,
} from "@/hooks/use-dashboard-layout";
import { formatMeanMs } from "@/services/dashboard/dashboard-aggregates";
import type { SocAnalystDashboardData } from "@/types/soc-dashboard";

const SOC_SECTIONS = [
  {
    id: "doNow",
    label: "Do now",
    description: "SLA breaches, at-risk cases, untriaged events",
    defaultVisible: true,
  },
  {
    id: "myWork",
    label: "My queue",
    description: "Work assigned or claimed to you",
    defaultVisible: true,
  },
  {
    id: "pipelineSla",
    label: "Pipeline · SLA",
    description: "Full SLA metric grid",
    defaultVisible: false,
  },
  {
    id: "pipelineEvents",
    label: "Pipeline · Security events",
    defaultVisible: false,
  },
  {
    id: "pipelineInvestigations",
    label: "Pipeline · Investigations",
    defaultVisible: false,
  },
  {
    id: "pipelineIncidents",
    label: "Pipeline · Incidents",
    defaultVisible: false,
  },
  {
    id: "pipelineFindings",
    label: "Pipeline · Findings",
    defaultVisible: false,
  },
  {
    id: "recentEvents",
    label: "Recent · Security events",
    defaultVisible: true,
  },
  {
    id: "recentInvestigations",
    label: "Recent · Investigations",
    defaultVisible: true,
  },
  {
    id: "recentIncidents",
    label: "Recent · Incidents",
    defaultVisible: true,
  },
  {
    id: "recentFindings",
    label: "Recent · Findings",
    defaultVisible: false,
  },
  {
    id: "notifications",
    label: "Notifications inbox",
    defaultVisible: false,
  },
  {
    id: "systemHealth",
    label: "Platform health",
    defaultVisible: false,
  },
] as const satisfies readonly DashboardSectionDef<string>[];

type SocSectionId = (typeof SOC_SECTIONS)[number]["id"];

const STORAGE_KEY = "cs-soc-home-layout-v1";

/**
 * Primary question: What should I work on next?
 * Layout is user-customizable; focused defaults reduce scroll pile-up.
 */
export function SocAnalystDashboard({
  data,
}: {
  data: SocAnalystDashboardData;
}) {
  const { sla, securityEvents, investigations, incidents, findings } = data;
  const layout = useDashboardLayout<SocSectionId>(STORAGE_KEY, SOC_SECTIONS);
  const { isVisible } = layout;

  const showPipelineHeader =
    isVisible("pipelineSla") ||
    isVisible("pipelineEvents") ||
    isVisible("pipelineInvestigations") ||
    isVisible("pipelineIncidents") ||
    isVisible("pipelineFindings");

  const showRecentHeader =
    isVisible("recentEvents") ||
    isVisible("recentInvestigations") ||
    isVisible("recentIncidents") ||
    isVisible("recentFindings");

  const showInboxHeader =
    isVisible("notifications") || isVisible("systemHealth");

  return (
    <div className="space-y-10">
      <PageHeader
        title="SOC Home"
        description="Start with what needs action now — then work your assigned queue. Customize to show only the cards you use."
        actions={
          <div className="flex flex-wrap gap-2">
            <DashboardCustomize
              title="Customize SOC Home"
              sections={SOC_SECTIONS}
              isVisible={layout.isVisible}
              setSection={layout.setSection}
              setAll={layout.setAll}
              reset={layout.reset}
              hiddenCount={layout.hiddenCount}
            />
            <Link
              href="/attention"
              className="inline-flex h-9 items-center rounded-[6px] border border-accent bg-accent px-3 text-sm font-medium text-white shadow-sm hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Open Attention queue
            </Link>
            <Link
              href="/security-events?status=NEW"
              className="inline-flex h-9 items-center rounded-[6px] border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-sm hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Triage new events
            </Link>
          </div>
        }
      />

      {layout.hiddenCount > 0 ? (
        <p className="rounded-[8px] border border-border bg-surface-elevated/60 px-4 py-2.5 text-sm text-muted">
          {layout.hiddenCount} section
          {layout.hiddenCount !== 1 ? "s are" : " is"} hidden. Use{" "}
          <span className="font-medium text-foreground">Customize</span> to add
          pipeline cards, inbox, or platform health back.
        </p>
      ) : null}

      {isVisible("doNow") ? (
        <section className="space-y-3">
          <SectionHeader
            title="Do now"
            description="SLA risk and untriaged detections — the highest-urgency work in the org."
            action={{ label: "View Attention", href: "/attention" }}
          />
          <SummaryStrip
            columns={4}
            metrics={[
              {
                label: "SLA breached",
                value: sla.breached,
                tone: "text-severity-critical",
                href: "/attention?sla=BREACHED",
              },
              {
                label: "SLA at risk",
                value: sla.atRisk,
                tone: "text-warning",
                href: "/attention?sla=APPROACHING",
              },
              {
                label: "Untriaged events",
                value: securityEvents.untriaged,
                tone: "text-severity-high",
                href: "/security-events?status=NEW",
              },
              {
                label: "Critical incidents",
                value: incidents.critical,
                tone: "text-severity-critical",
                href: "/incidents?severity=CRITICAL",
              },
            ]}
          />
        </section>
      ) : null}

      {isVisible("myWork") ? <MyWorkSection cards={data.myWork} /> : null}

      {showPipelineHeader ? (
        <section className="space-y-6">
          <SectionHeader
            title="Pipeline snapshot"
            description="Volume across detect → investigate → respond → remediate."
            tone="secondary"
          />

          {isVisible("pipelineSla") ? (
            <OverviewMetricGrid
              title="SLA"
              description={
                sla.hasSlaPolicies
                  ? "Contractual incident SLA on open HIGH/CRITICAL cases."
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
          ) : null}

          <div className="grid gap-6 xl:grid-cols-2">
            {isVisible("pipelineEvents") ? (
              <OverviewMetricGrid
                title="Security Events"
                description="Detection pipeline"
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
                    label: "→ Investigations",
                    value: securityEvents.convertedToInvestigations,
                    href: "/investigations",
                  },
                ]}
              />
            ) : null}
            {isVisible("pipelineInvestigations") ? (
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
            ) : null}
            {isVisible("pipelineIncidents") ? (
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
                    label: "Mean Resolution",
                    value: formatMeanMs(incidents.meanResolutionTimeMs),
                  },
                ]}
              />
            ) : null}
            {isVisible("pipelineFindings") ? (
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
            ) : null}
          </div>
        </section>
      ) : null}

      {showRecentHeader ? (
        <section className="space-y-3">
          <SectionHeader
            title="Recent activity"
            description="Latest movement across the response workflow."
            action={{ label: "Open Attention", href: "/attention" }}
          />
          <div className="grid gap-6 xl:grid-cols-2">
            {isVisible("recentEvents") ? (
              <RecentSecurityEventsTable rows={securityEvents.recent} />
            ) : null}
            {isVisible("recentInvestigations") ? (
              <RecentInvestigationsTable
                rows={investigations.recentlyUpdated}
              />
            ) : null}
            {isVisible("recentIncidents") ? (
              <RecentIncidentsTable rows={incidents.recent} />
            ) : null}
            {isVisible("recentFindings") ? (
              <RecentFindingsTable
                rows={
                  findings.newest.length > 0
                    ? findings.newest
                    : findings.recent
                }
                title="Newest Findings"
                description="Most recently first-detected open findings"
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {showInboxHeader ? (
        <section className="space-y-6 border-t border-border pt-8">
          <SectionHeader
            title="Inbox & platform"
            description="Secondary context — notifications and ingestion health."
            tone="secondary"
          />
          {isVisible("notifications") ? (
            <NotificationsSection
              unreadCount={data.notifications.unreadCount}
              recent={data.notifications.recent}
            />
          ) : null}
          {isVisible("systemHealth") ? (
            <SystemHealthSection health={data.systemHealth} />
          ) : null}
        </section>
      ) : null}

      {!showPipelineHeader && !showInboxHeader ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-6">
          <p className="text-sm text-muted">Need more context?</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => layout.setAll(true)}
          >
            Show all sections
          </Button>
        </div>
      ) : null}
    </div>
  );
}
