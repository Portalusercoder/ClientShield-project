import { getExecutiveDashboard } from "@/services/dashboard/executive-dashboard.service";
import {
  buildBaseDocument,
  filterLabel,
  withBrand,
} from "@/services/reporting/shared/report-builder";
import { msToHuman } from "@/services/reporting/shared/date-helpers";
import type {
  FrameworkReportDocument,
  ReportFilters,
} from "@/types/reporting-framework";

/**
 * Executive Summary — reuses getExecutiveDashboard aggregates (no duplicate queries).
 */
export async function buildExecutiveReport(input: {
  organizationId: string;
  filters?: ReportFilters;
}): Promise<FrameworkReportDocument> {
  const filters = input.filters ?? {};
  const [brand, dash] = await Promise.all([
    withBrand(input.organizationId),
    getExecutiveDashboard({ organizationId: input.organizationId }),
  ]);

  const kpis = dash.kpis;
  const posture = kpis.posture;
  const sla = dash.sla;

  const deductionBullets = [
    `Critical incidents: −${posture.deductions.criticalIncidents}`,
    `Critical findings: −${posture.deductions.criticalFindings}`,
    `Breached SLA: −${posture.deductions.breachedSla}`,
    `Open investigations: −${posture.deductions.openInvestigations}`,
    `Open security events: −${posture.deductions.openSecurityEvents}`,
  ];

  return buildBaseDocument({
    kind: "EXECUTIVE_SUMMARY",
    brand,
    filters,
    summary: `Organisation posture score ${posture.score}/100 (grade ${posture.grade}). ${filterLabel(filters)}.`,
    metadata: {
      postureScore: posture.score,
      postureGrade: posture.grade,
      openIncidents: kpis.openIncidents,
      activeInvestigations: kpis.activeInvestigations,
    },
    sections: [
      {
        id: "kpis",
        title: "Executive KPIs",
        summary: "Live organisation metrics from the executive dashboard service.",
        kpis: [
          { label: "Clients", value: String(kpis.totalClients) },
          { label: "Assets", value: String(kpis.totalAssets) },
          { label: "Open incidents", value: String(kpis.openIncidents) },
          {
            label: "Active investigations",
            value: String(kpis.activeInvestigations),
          },
        ],
      },
      {
        id: "posture",
        title: "Security Posture",
        summary: `Score ${posture.score} (grade ${posture.grade}). Deductions total −${posture.deductions.total}.`,
        bullets: deductionBullets,
        kpis: [
          { label: "Score", value: String(posture.score) },
          { label: "Grade", value: posture.grade },
          {
            label: "Critical findings",
            value: String(kpis.criticalFindings),
          },
          {
            label: "Asset avg score",
            value:
              kpis.assetPostureAverage == null
                ? "N/A"
                : String(kpis.assetPostureAverage),
          },
        ],
      },
      {
        id: "sla",
        title: "SLA Compliance",
        summary: sla.hasSlaPolicies
          ? `Compliance ${sla.compliancePercent ?? "N/A"}% across ${sla.evaluated} evaluated HIGH/CRITICAL open incidents.`
          : "No enabled SLA policies configured.",
        kpis: [
          {
            label: "Compliance",
            value:
              sla.compliancePercent == null
                ? "N/A"
                : `${sla.compliancePercent}%`,
          },
          { label: "Breached", value: String(sla.breached) },
          { label: "At risk", value: String(sla.atRisk) },
          {
            label: "Avg response",
            value: msToHuman(sla.averageResponseTimeMs),
          },
        ],
      },
      {
        id: "trends",
        title: "Activity Trends",
        tables: [
          {
            id: "trends",
            title: "Last 7 / 30 days",
            columns: [
              { key: "metric", label: "Metric" },
              { key: "d7", label: "7 days" },
              { key: "d30", label: "30 days" },
            ],
            rows: [
              {
                metric: "Incidents created",
                d7: dash.trends.last7Days.incidentsCreated,
                d30: dash.trends.last30Days.incidentsCreated,
              },
              {
                metric: "Findings created",
                d7: dash.trends.last7Days.findingsCreated,
                d30: dash.trends.last30Days.findingsCreated,
              },
              {
                metric: "Investigations opened",
                d7: dash.trends.last7Days.investigationsOpened,
                d30: dash.trends.last30Days.investigationsOpened,
              },
              {
                metric: "Security events ingested",
                d7: dash.trends.last7Days.securityEventsIngested,
                d30: dash.trends.last30Days.securityEventsIngested,
              },
              {
                metric: "Incidents resolved",
                d7: dash.trends.last7Days.incidentsResolved,
                d30: dash.trends.last30Days.incidentsResolved,
              },
            ],
          },
        ],
      },
      {
        id: "risk",
        title: "Highest Risk Entities",
        tables: [
          {
            id: "risk-assets",
            title: "Highest risk assets",
            columns: [
              { key: "name", label: "Asset" },
              { key: "score", label: "Score" },
            ],
            rows: dash.risk.highestRiskAssets.map((a) => ({
              name: a.name,
              score: a.securityScore,
            })),
          },
          {
            id: "risk-clients",
            title: "Highest risk clients",
            columns: [
              { key: "name", label: "Client" },
              { key: "score", label: "Score" },
            ],
            rows: dash.risk.highestRiskClients.map((c) => ({
              name: c.name,
              score: c.securityScore,
            })),
          },
        ],
      },
    ],
  });
}
