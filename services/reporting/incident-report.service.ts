import {
  getIncidentById,
  listIncidents,
} from "@/services/incidents/queries";
import {
  buildBaseDocument,
  filterLabel,
  REPORT_ROW_LIMIT,
  withBrand,
} from "@/services/reporting/shared/report-builder";
import {
  formatReportDateTime,
  resolveDateRange,
} from "@/services/reporting/shared/date-helpers";
import type {
  FrameworkReportDocument,
  ReportFilters,
} from "@/types/reporting-framework";
import type {
  IncidentSeverity,
  IncidentStatus,
} from "@prisma/client";

/**
 * Incident Report — uses listIncidents / getIncidentById (no duplicated domain rules).
 */
export async function buildIncidentReport(input: {
  organizationId: string;
  filters?: ReportFilters;
}): Promise<FrameworkReportDocument> {
  const filters = input.filters ?? {};
  const brand = await withBrand(input.organizationId);
  const { from, to } = resolveDateRange(filters);

  if (filters.incidentId) {
    const incident = await getIncidentById(
      input.organizationId,
      filters.incidentId
    );
    if (!incident) {
      return buildBaseDocument({
        kind: "INCIDENT",
        brand,
        filters,
        summary: "Incident not found for this organisation.",
        sections: [],
        metadata: { rowCount: 0 },
      });
    }

    return buildBaseDocument({
      kind: "INCIDENT",
      brand,
      filters,
      title: `Incident Report — ${incident.caseNumber}`,
      summary: `${incident.caseNumber}: ${incident.title} (${incident.severity} / ${incident.status}). ${filterLabel(filters)}.`,
      metadata: {
        rowCount: 1,
        caseNumber: incident.caseNumber,
        severity: incident.severity,
        status: incident.status,
      },
      sections: [
        {
          id: "detail",
          title: "Incident detail",
          kpis: [
            { label: "Case", value: incident.caseNumber },
            { label: "Severity", value: incident.severity },
            { label: "Status", value: incident.status },
            { label: "Client", value: incident.clientName },
          ],
          bullets: [
            `Detected: ${formatReportDateTime(incident.detectedAt)}`,
            `Assigned: ${incident.assignedToName ?? "Unassigned"}`,
            `Lead: ${incident.leadAnalystName ?? "—"}`,
            `Asset: ${incident.assetName ?? "—"}`,
          ],
          tables: [
            {
              id: "incident-row",
              title: "Incident record",
              columns: [
                { key: "caseNumber", label: "Case" },
                { key: "title", label: "Title" },
                { key: "severity", label: "Severity" },
                { key: "status", label: "Status" },
                { key: "client", label: "Client" },
                { key: "detectedAt", label: "Detected" },
              ],
              rows: [
                {
                  caseNumber: incident.caseNumber,
                  title: incident.title,
                  severity: incident.severity,
                  status: incident.status,
                  client: incident.clientName,
                  detectedAt: formatReportDateTime(incident.detectedAt),
                },
              ],
            },
          ],
        },
      ],
    });
  }

  const baseFilters = {
    clientId: filters.clientId ?? "ALL",
    assetId: filters.assetId ?? "ALL",
    severity: (filters.severity as IncidentSeverity | "ALL") ?? "ALL",
    status: (filters.status as IncidentStatus | "ALL") ?? "ALL",
    category: "ALL" as const,
    source: "ALL" as const,
    assignedToUserId: filters.ownerUserId ?? "ALL",
    leadAnalystUserId: "ALL",
    sortBy: "detectedAt" as const,
    sortDir: "desc" as const,
    detectedFrom: from?.toISOString() ?? null,
    detectedTo: to?.toISOString() ?? null,
  };

  const first = await listIncidents(input.organizationId, {
    ...baseFilters,
    page: 1,
    pageSize: 100,
  });

  let incidents = [...first.incidents];
  let page = 2;
  while (incidents.length < first.total && incidents.length < REPORT_ROW_LIMIT) {
    const next = await listIncidents(input.organizationId, {
      ...baseFilters,
      page,
      pageSize: 100,
    });
    if (next.incidents.length === 0) break;
    incidents = incidents.concat(next.incidents);
    page += 1;
    if (page > 20) break;
  }
  incidents = incidents.slice(0, REPORT_ROW_LIMIT);

  const rows = incidents.map((r) => ({
    caseNumber: r.caseNumber,
    title: r.title,
    severity: r.severity,
    status: r.status,
    category: r.category,
    client: r.clientName,
    asset: r.assetName ?? "",
    assignee: r.assignedToName ?? "",
    detectedAt: formatReportDateTime(r.detectedAt),
  }));

  return buildBaseDocument({
    kind: "INCIDENT",
    brand,
    filters,
    summary: `${first.total} incident(s) matched (${rows.length} included). ${filterLabel(filters)}.`,
    metadata: {
      rowCount: rows.length,
      totalMatched: first.total,
      truncated: first.total > rows.length ? 1 : 0,
    },
    sections: [
      {
        id: "summary",
        title: "Incident summary",
        kpis: [
          { label: "Matched", value: String(first.total) },
          { label: "In report", value: String(rows.length) },
          {
            label: "Critical open (org)",
            value: String(first.summary.criticalOpen),
          },
          {
            label: "Unassigned open (org)",
            value: String(first.summary.unassigned),
          },
        ],
        tables: [
          {
            id: "incidents",
            title: "Incidents",
            columns: [
              { key: "caseNumber", label: "Case" },
              { key: "title", label: "Title" },
              { key: "severity", label: "Severity" },
              { key: "status", label: "Status" },
              { key: "client", label: "Client" },
              { key: "asset", label: "Asset" },
              { key: "assignee", label: "Owner" },
              { key: "detectedAt", label: "Detected" },
            ],
            rows,
          },
        ],
      },
    ],
  });
}
