/**
 * On-demand reporting framework DTOs (Phase 6C3).
 * Session/preview oriented — not the persisted SECURITY_POSTURE Report rows.
 */
export type FrameworkReportKind =
  | "EXECUTIVE_SUMMARY"
  | "INCIDENT"
  | "INVESTIGATION"
  | "FINDINGS"
  | "ASSET_SECURITY"
  | "CLIENT_SECURITY"
  | "SLA";

export interface ReportFilters {
  dateFrom?: string | null;
  dateTo?: string | null;
  clientId?: string | null;
  assetId?: string | null;
  severity?: string | null;
  status?: string | null;
  ownerUserId?: string | null;
  findingStatus?: string | null;
  incidentId?: string | null;
  investigationId?: string | null;
}

export interface ReportTableColumn {
  key: string;
  label: string;
}

export interface ReportTable {
  id: string;
  title: string;
  columns: ReportTableColumn[];
  rows: Record<string, string | number | null>[];
}

export interface ReportSection {
  id: string;
  title: string;
  summary?: string;
  bullets?: string[];
  kpis?: Array<{ label: string; value: string }>;
  tables?: ReportTable[];
}

export interface FrameworkReportDocument {
  kind: FrameworkReportKind;
  title: string;
  organizationId: string;
  organizationName: string;
  generatedAt: string;
  filters: ReportFilters;
  summary: string;
  sections: ReportSection[];
  metadata: Record<string, string | number | null>;
}

export const FRAMEWORK_REPORT_LABELS: Record<FrameworkReportKind, string> = {
  EXECUTIVE_SUMMARY: "Executive Summary Report",
  INCIDENT: "Incident Report",
  INVESTIGATION: "Investigation Report",
  FINDINGS: "Findings Report",
  ASSET_SECURITY: "Asset Security Report",
  CLIENT_SECURITY: "Client Security Report",
  SLA: "SLA Report",
};
