import { prisma } from "@/lib/db";
import { getIncidentCaseMetrics } from "@/services/incidents/queries";
import { OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import { evaluateIncidentSla } from "@/services/sla/sla-calculator.service";
import { loadActiveSnapshotsForIncidents } from "@/services/sla/sla-snapshot.service";
import { listSlaPolicies } from "@/services/sla/sla-policy.service";
import {
  buildBaseDocument,
  filterLabel,
  withBrand,
} from "@/services/reporting/shared/report-builder";
import {
  formatReportDateTime,
  msToHuman,
} from "@/services/reporting/shared/date-helpers";
import type {
  FrameworkReportDocument,
  ReportFilters,
} from "@/types/reporting-framework";

/**
 * SLA Report — reuses evaluateIncidentSla + snapshots + policies (no calc duplication).
 */
export async function buildSlaReport(input: {
  organizationId: string;
  filters?: ReportFilters;
}): Promise<FrameworkReportDocument> {
  const filters = input.filters ?? {};
  const brand = await withBrand(input.organizationId);

  const [policies, openIncidents, caseMetrics] = await Promise.all([
    listSlaPolicies(input.organizationId),
    prisma.incident.findMany({
      where: {
        organizationId: input.organizationId,
        status: { in: [...OPEN_INCIDENT_STATUSES] },
        severity: { in: ["CRITICAL", "HIGH"] },
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
        ...(filters.assetId ? { assetId: filters.assetId } : {}),
        ...(filters.ownerUserId
          ? { assignedToUserId: filters.ownerUserId }
          : {}),
        ...(filters.incidentId ? { id: filters.incidentId } : {}),
        ...(filters.severity
          ? { severity: filters.severity as "CRITICAL" | "HIGH" }
          : {}),
      },
      select: {
        id: true,
        caseNumber: true,
        title: true,
        severity: true,
        status: true,
        detectedAt: true,
        acknowledgedAt: true,
        containedAt: true,
        resolvedAt: true,
        client: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: { detectedAt: "desc" },
      take: 500,
    }),
    getIncidentCaseMetrics(input.organizationId),
  ]);

  const snapshots = await loadActiveSnapshotsForIncidents({
    organizationId: input.organizationId,
    incidentIds: openIncidents.map((i) => i.id),
  });

  const now = new Date();
  let breached = 0;
  let atRisk = 0;
  let onTrack = 0;
  let evaluated = 0;

  const rows = openIncidents.map((incident) => {
    const snapshot = snapshots.get(incident.id) ?? null;
    const evaluation = evaluateIncidentSla({
      snapshot,
      clocks: {
        detectedAt: incident.detectedAt,
        acknowledgedAt: incident.acknowledgedAt,
        containedAt: incident.containedAt,
        resolvedAt: incident.resolvedAt,
      },
      now,
    });

    if (
      evaluation.overallState !== "NO_POLICY" &&
      evaluation.overallState !== "MET"
    ) {
      evaluated += 1;
      if (evaluation.overallState === "BREACHED") breached += 1;
      else if (evaluation.overallState === "APPROACHING") atRisk += 1;
      else if (evaluation.overallState === "ON_TRACK") onTrack += 1;
    }

    return {
      caseNumber: incident.caseNumber,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      client: incident.client.name,
      owner: incident.assignedTo?.name ?? "",
      slaState: evaluation.overallState,
      detectedAt: formatReportDateTime(incident.detectedAt),
    };
  });

  const compliancePercent =
    evaluated === 0 ? null : Math.round((onTrack / evaluated) * 1000) / 10;

  const policyRows = policies.map((p) => ({
    severity: p.severity,
    enabled: p.enabled ? "yes" : "no",
    acknowledgeMinutes: p.mttaMinutes,
    containMinutes: p.mttcMinutes,
    resolveMinutes: p.mttrMinutes,
    approachingPct: p.approachingThresholdPct,
    clientScope: p.clientName ?? "Organisation default",
  }));

  return buildBaseDocument({
    kind: "SLA",
    brand,
    filters,
    summary: `SLA evaluation for ${openIncidents.length} open HIGH/CRITICAL incident(s); compliance ${compliancePercent ?? "N/A"}%. ${filterLabel(filters)}.`,
    metadata: {
      rowCount: rows.length,
      evaluated,
      breached,
      atRisk,
      onTrack,
      policyCount: policies.length,
    },
    sections: [
      {
        id: "overview",
        title: "SLA overview",
        kpis: [
          {
            label: "Compliance",
            value:
              compliancePercent == null ? "N/A" : `${compliancePercent}%`,
          },
          { label: "Breached", value: String(breached) },
          { label: "At risk", value: String(atRisk) },
          {
            label: "Avg acknowledge",
            value: msToHuman(caseMetrics.meanTimeToAcknowledgeMs),
          },
        ],
      },
      {
        id: "policies",
        title: "SLA policies",
        tables: [
          {
            id: "policies-table",
            title: "Policies",
            columns: [
              { key: "severity", label: "Severity" },
              { key: "enabled", label: "Enabled" },
              { key: "acknowledgeMinutes", label: "MTTA (min)" },
              { key: "containMinutes", label: "MTTC (min)" },
              { key: "resolveMinutes", label: "MTTR (min)" },
              { key: "approachingPct", label: "Approach %" },
              { key: "clientScope", label: "Scope" },
            ],
            rows: policyRows,
          },
        ],
      },
      {
        id: "incidents",
        title: "Open contractual incidents",
        tables: [
          {
            id: "sla-incidents",
            title: "Incident SLA states",
            columns: [
              { key: "caseNumber", label: "Case" },
              { key: "title", label: "Title" },
              { key: "severity", label: "Severity" },
              { key: "slaState", label: "SLA state" },
              { key: "client", label: "Client" },
              { key: "owner", label: "Owner" },
              { key: "detectedAt", label: "Detected" },
            ],
            rows,
          },
        ],
      },
    ],
  });
}
