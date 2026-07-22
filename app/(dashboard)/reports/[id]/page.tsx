import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportPreviewView } from "@/components/reports/report-preview-view";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { createAuditLog } from "@/services/audit.service";
import {
  getReportById,
  getReportTitle,
  getSnapshotFromReport,
} from "@/services/reports/report.service";

export const dynamic = "force-dynamic";

interface ReportDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ReportDetailPageProps): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const title = await getReportTitle(session.organizationId, id);
  return { title: title ?? "Report" };
}

export default async function ReportDetailPage({
  params,
}: ReportDetailPageProps) {
  const session = await requireSession();
  const { id } = await params;
  const report = await getReportById(session.organizationId, id);
  if (!report) notFound();

  await createAuditLog({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "REPORT_VIEWED",
    resourceType: "Report",
    resourceId: report.id,
    metadata: { clientId: report.clientId },
  });

  const snapshot = getSnapshotFromReport(report);

  return (
    <ReportPreviewView
      reportId={report.id}
      title={report.title}
      status={report.status}
      version={report.version}
      clientName={report.client.name}
      snapshot={snapshot}
      errorSummary={report.errorSummary}
      canArchive={hasMinimumRole(session, "ADMIN")}
    />
  );
}
