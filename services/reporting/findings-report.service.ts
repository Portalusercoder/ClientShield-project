import type { FindingSeverity, FindingStatus } from "@prisma/client";
import { listFindings } from "@/services/findings.service";
import {
  buildBaseDocument,
  filterLabel,
  withBrand,
} from "@/services/reporting/shared/report-builder";
import { formatReportDateTime } from "@/services/reporting/shared/date-helpers";
import type {
  FrameworkReportDocument,
  ReportFilters,
} from "@/types/reporting-framework";

/** listFindings pageSize is uncapped in service; keep exports bounded. */
const FINDINGS_PAGE_SIZE = 100;

/**
 * Findings Report — reuses listFindings / getFindingSummary via listFindings.
 */
export async function buildFindingsReport(input: {
  organizationId: string;
  filters?: ReportFilters;
}): Promise<FrameworkReportDocument> {
  const filters = input.filters ?? {};
  const brand = await withBrand(input.organizationId);

  const list = await listFindings(input.organizationId, {
    clientId: filters.clientId ?? "ALL",
    assetId: filters.assetId ?? "ALL",
    severity: (filters.severity as FindingSeverity | "ALL") ?? "ALL",
    status:
      (filters.findingStatus as FindingStatus | "ALL") ??
      (filters.status as FindingStatus | "ALL") ??
      "ALL",
    assignedToUserId: filters.ownerUserId ?? "ALL",
    page: 1,
    pageSize: FINDINGS_PAGE_SIZE,
  });

  // Page through remaining up to 500 total
  let findings = [...list.findings];
  let page = 2;
  while (findings.length < list.total && findings.length < 500) {
    const next = await listFindings(input.organizationId, {
      clientId: filters.clientId ?? "ALL",
      assetId: filters.assetId ?? "ALL",
      severity: (filters.severity as FindingSeverity | "ALL") ?? "ALL",
      status:
        (filters.findingStatus as FindingStatus | "ALL") ??
        (filters.status as FindingStatus | "ALL") ??
        "ALL",
      assignedToUserId: filters.ownerUserId ?? "ALL",
      page,
      pageSize: FINDINGS_PAGE_SIZE,
    });
    if (next.findings.length === 0) break;
    findings = findings.concat(next.findings);
    page += 1;
    if (page > 20) break;
  }
  findings = findings.slice(0, 500);

  const rows = findings.map((f) => ({
    code: f.code ?? "",
    title: f.title,
    severity: f.severity,
    status: f.status,
    client: f.clientName ?? "",
    asset: f.assetName ?? "",
    assignee: f.assignedToName ?? "",
    source: f.source,
    lastDetectedAt: formatReportDateTime(f.lastDetectedAt),
  }));

  return buildBaseDocument({
    kind: "FINDINGS",
    brand,
    filters,
    summary: `${list.total} finding(s) matched (${rows.length} included). ${filterLabel(filters)}.`,
    metadata: {
      rowCount: rows.length,
      totalMatched: list.total,
      truncated: list.total > rows.length ? 1 : 0,
    },
    sections: [
      {
        id: "findings",
        title: "Findings",
        kpis: [
          { label: "Matched", value: String(list.total) },
          { label: "In report", value: String(rows.length) },
          {
            label: "Needs triage (org)",
            value: String(list.summary.needsTriage),
          },
          {
            label: "Critical open (org)",
            value: String(list.summary.criticalOpen),
          },
        ],
        tables: [
          {
            id: "findings-table",
            title: "Findings",
            columns: [
              { key: "code", label: "Code" },
              { key: "title", label: "Title" },
              { key: "severity", label: "Severity" },
              { key: "status", label: "Status" },
              { key: "client", label: "Client" },
              { key: "asset", label: "Asset" },
              { key: "assignee", label: "Owner" },
              { key: "lastDetectedAt", label: "Last detected" },
            ],
            rows,
          },
        ],
      },
    ],
  });
}
