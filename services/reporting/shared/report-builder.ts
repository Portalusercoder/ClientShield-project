import type {
  FrameworkReportDocument,
  FrameworkReportKind,
  ReportFilters,
  ReportSection,
  ReportTable,
} from "@/types/reporting-framework";
import { FRAMEWORK_REPORT_LABELS } from "@/types/reporting-framework";
import { getOrganizationBrand } from "@/services/reporting/shared/branding";

export const REPORT_ROW_LIMIT = 500;

export function buildBaseDocument(input: {
  kind: FrameworkReportKind;
  brand: { organizationId: string; organizationName: string };
  filters: ReportFilters;
  summary: string;
  sections: ReportSection[];
  metadata?: Record<string, string | number | null>;
  title?: string;
}): FrameworkReportDocument {
  return {
    kind: input.kind,
    title: input.title ?? FRAMEWORK_REPORT_LABELS[input.kind],
    organizationId: input.brand.organizationId,
    organizationName: input.brand.organizationName,
    generatedAt: new Date().toISOString(),
    filters: input.filters,
    summary: input.summary,
    sections: input.sections,
    metadata: input.metadata ?? {},
  };
}

export async function withBrand(
  organizationId: string
): Promise<{ organizationId: string; organizationName: string }> {
  return getOrganizationBrand(organizationId);
}

export function emptyTable(
  id: string,
  title: string,
  columns: ReportTable["columns"]
): ReportTable {
  return { id, title, columns, rows: [] };
}

export function filterLabel(filters: ReportFilters): string {
  const parts: string[] = [];
  if (filters.dateFrom || filters.dateTo) {
    parts.push(
      `Period: ${filters.dateFrom ?? "…"} → ${filters.dateTo ?? "…"}`
    );
  }
  if (filters.clientId) parts.push(`Client: ${filters.clientId}`);
  if (filters.assetId) parts.push(`Asset: ${filters.assetId}`);
  if (filters.severity) parts.push(`Severity: ${filters.severity}`);
  if (filters.status) parts.push(`Status: ${filters.status}`);
  if (filters.findingStatus) parts.push(`Finding status: ${filters.findingStatus}`);
  if (filters.ownerUserId) parts.push(`Owner: ${filters.ownerUserId}`);
  if (filters.incidentId) parts.push(`Incident: ${filters.incidentId}`);
  if (filters.investigationId)
    parts.push(`Investigation: ${filters.investigationId}`);
  return parts.length ? parts.join(" · ") : "No filters applied (organisation-wide)";
}
