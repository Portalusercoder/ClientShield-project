import { reportTablesToCsv } from "@/services/reporting/shared/csv";
import { reportFilename } from "@/services/reporting/shared/branding";
import { renderFrameworkReportPdf } from "@/services/reporting/shared/pdf-builder";
import { buildExecutiveReport } from "@/services/reporting/executive-report.service";
import { buildIncidentReport } from "@/services/reporting/incident-report.service";
import { buildInvestigationReport } from "@/services/reporting/investigation-report.service";
import { buildFindingsReport } from "@/services/reporting/findings-report.service";
import { buildAssetReport } from "@/services/reporting/asset-report.service";
import { buildClientReport } from "@/services/reporting/client-report.service";
import { buildSlaReport } from "@/services/reporting/sla-report.service";
import type {
  FrameworkReportDocument,
  FrameworkReportKind,
  ReportFilters,
} from "@/types/reporting-framework";
import { FRAMEWORK_REPORT_LABELS } from "@/types/reporting-framework";

export const FRAMEWORK_REPORT_KINDS = Object.keys(
  FRAMEWORK_REPORT_LABELS
) as FrameworkReportKind[];

export function isFrameworkReportKind(
  value: string
): value is FrameworkReportKind {
  return value in FRAMEWORK_REPORT_LABELS;
}

/**
 * Central orchestrator for on-demand framework reports.
 */
export async function buildFrameworkReport(input: {
  organizationId: string;
  kind: FrameworkReportKind;
  filters?: ReportFilters;
}): Promise<FrameworkReportDocument> {
  const filters = input.filters ?? {};
  switch (input.kind) {
    case "EXECUTIVE_SUMMARY":
      return buildExecutiveReport({
        organizationId: input.organizationId,
        filters,
      });
    case "INCIDENT":
      return buildIncidentReport({
        organizationId: input.organizationId,
        filters,
      });
    case "INVESTIGATION":
      return buildInvestigationReport({
        organizationId: input.organizationId,
        filters,
      });
    case "FINDINGS":
      return buildFindingsReport({
        organizationId: input.organizationId,
        filters,
      });
    case "ASSET_SECURITY":
      return buildAssetReport({
        organizationId: input.organizationId,
        filters,
      });
    case "CLIENT_SECURITY":
      return buildClientReport({
        organizationId: input.organizationId,
        filters,
      });
    case "SLA":
      return buildSlaReport({
        organizationId: input.organizationId,
        filters,
      });
    default: {
      const _exhaustive: never = input.kind;
      throw new Error(`Unsupported report kind: ${_exhaustive}`);
    }
  }
}

export async function previewFrameworkReport(input: {
  organizationId: string;
  kind: FrameworkReportKind;
  filters?: ReportFilters;
}): Promise<FrameworkReportDocument> {
  return buildFrameworkReport(input);
}

export async function exportFrameworkReportPdf(input: {
  organizationId: string;
  kind: FrameworkReportKind;
  filters?: ReportFilters;
}): Promise<{ buffer: Buffer; filename: string; report: FrameworkReportDocument }> {
  const report = await buildFrameworkReport(input);
  const buffer = await renderFrameworkReportPdf(report);
  return {
    buffer,
    filename: reportFilename(report.kind, "pdf", new Date(report.generatedAt)),
    report,
  };
}

export async function exportFrameworkReportCsv(input: {
  organizationId: string;
  kind: FrameworkReportKind;
  filters?: ReportFilters;
}): Promise<{ csv: string; filename: string; report: FrameworkReportDocument }> {
  const report = await buildFrameworkReport(input);
  const tables = report.sections.flatMap((s) => s.tables ?? []);
  const csv = reportTablesToCsv(tables);
  return {
    csv,
    filename: reportFilename(report.kind, "csv", new Date(report.generatedAt)),
    report,
  };
}
