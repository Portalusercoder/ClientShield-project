import type { Prisma, ReportStatus, ReportType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/services/audit.service";
import { buildSecurityPostureSnapshot } from "@/services/reports/report-data.service";
import { renderSecurityPosturePdf } from "@/services/reports/report-pdf.service";
import {
  buildReportStorageKey,
  readReportPdf,
  saveReportPdf,
} from "@/services/reports/report-storage.service";
import type { SecurityPostureReportSnapshot } from "@/types/reports";

export interface ReportListItem {
  id: string;
  title: string;
  reportType: ReportType;
  status: ReportStatus;
  clientId: string;
  clientName: string;
  reportingPeriodStart: Date;
  reportingPeriodEnd: Date;
  generatedAt: Date | null;
  version: number;
  createdByName: string | null;
  createdAt: Date;
}

export async function listReports(
  organizationId: string,
  filters: {
    clientId?: string;
    reportType?: ReportType | "ALL";
    status?: ReportStatus | "ALL";
    page?: number;
    pageSize?: number;
  } = {}
): Promise<{
  reports: ReportListItem[];
  total: number;
  page: number;
  pageSize: number;
  clients: { id: string; name: string }[];
}> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const where: Prisma.ReportWhereInput = {
    organizationId,
    ...(filters.clientId && filters.clientId !== "ALL"
      ? { clientId: filters.clientId }
      : {}),
    ...(filters.reportType && filters.reportType !== "ALL"
      ? { reportType: filters.reportType }
      : {}),
    ...(filters.status && filters.status !== "ALL"
      ? { status: filters.status }
      : {}),
  };

  const [rows, total, clients] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: [{ generatedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        reportType: true,
        status: true,
        clientId: true,
        reportingPeriodStart: true,
        reportingPeriodEnd: true,
        generatedAt: true,
        version: true,
        createdAt: true,
        client: { select: { name: true } },
        createdBy: { select: { name: true, email: true } },
      },
    }),
    prisma.report.count({ where }),
    prisma.client.findMany({
      where: { organizationId, status: { not: "INACTIVE" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    reports: rows.map((r) => ({
      id: r.id,
      title: r.title,
      reportType: r.reportType,
      status: r.status,
      clientId: r.clientId,
      clientName: r.client.name,
      reportingPeriodStart: r.reportingPeriodStart,
      reportingPeriodEnd: r.reportingPeriodEnd,
      generatedAt: r.generatedAt,
      version: r.version,
      createdByName: r.createdBy?.name ?? r.createdBy?.email ?? null,
      createdAt: r.createdAt,
    })),
    total,
    page,
    pageSize,
    clients,
  };
}

export async function getReportById(
  organizationId: string,
  reportId: string
) {
  return prisma.report.findFirst({
    where: { id: reportId, organizationId },
    include: {
      client: { select: { id: true, name: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });
}

/** Lightweight lookup for titles/metadata — does not load generatedData. */
export async function getReportTitle(
  organizationId: string,
  reportId: string
): Promise<string | null> {
  const report = await prisma.report.findFirst({
    where: { id: reportId, organizationId },
    select: { title: true },
  });
  return report?.title ?? null;
}

export async function generateSecurityPostureReport(input: {
  organizationId: string;
  actorId: string;
  clientId: string;
  title: string;
  periodStart: Date;
  periodEnd: Date;
  reportType?: ReportType;
}): Promise<{ id: string }> {
  const reportType = input.reportType ?? "SECURITY_POSTURE";

  if (input.periodStart.getTime() > input.periodEnd.getTime()) {
    throw new Error("Reporting period start must be on or before end date");
  }

  const client = await prisma.client.findFirst({
    where: {
      id: input.clientId,
      organizationId: input.organizationId,
    },
    select: { id: true, name: true },
  });
  if (!client) throw new Error("Client not found");

  if (reportType !== "SECURITY_POSTURE") {
    throw new Error(
      "Only SECURITY_POSTURE reports are available in this MVP. Other types are reserved."
    );
  }

  const priorCount = await prisma.report.count({
    where: {
      organizationId: input.organizationId,
      clientId: input.clientId,
      reportType,
    },
  });
  const version = priorCount + 1;

  const report = await prisma.report.create({
    data: {
      organizationId: input.organizationId,
      clientId: input.clientId,
      createdByUserId: input.actorId,
      reportType,
      title: input.title.trim() || `Security Posture Report — ${client.name}`,
      reportingPeriodStart: input.periodStart,
      reportingPeriodEnd: input.periodEnd,
      status: "GENERATING",
      version,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "REPORT_GENERATION_REQUESTED",
    resourceType: "Report",
    resourceId: report.id,
    metadata: {
      clientId: input.clientId,
      reportType,
      version,
    },
  });

  try {
    const snapshot = await buildSecurityPostureSnapshot({
      organizationId: input.organizationId,
      clientId: input.clientId,
      title: report.title,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      version,
    });

    const pdf = await renderSecurityPosturePdf(snapshot);
    const storageKey = buildReportStorageKey({
      organizationId: input.organizationId,
      reportId: report.id,
      version,
    });
    await saveReportPdf(storageKey, pdf);

    const fileName = `ClientShield_${slugify(client.name)}_SecurityPosture_v${version}.pdf`;

    await prisma.report.update({
      where: { id: report.id },
      data: {
        status: "READY",
        generatedAt: new Date(),
        generatedData: snapshot as unknown as Prisma.InputJsonValue,
        storageKey,
        fileName,
        errorSummary: null,
      },
    });

    await createAuditLog({
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: "REPORT_GENERATED",
      resourceType: "Report",
      resourceId: report.id,
      metadata: { clientId: input.clientId, version, fileName },
    });

    return { id: report.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Report generation failed";

    await prisma.report.update({
      where: { id: report.id },
      data: {
        status: "FAILED",
        errorSummary: message.slice(0, 500),
      },
    });

    await createAuditLog({
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: "REPORT_GENERATION_FAILED",
      resourceType: "Report",
      resourceId: report.id,
      metadata: { clientId: input.clientId, error: message.slice(0, 200) },
    });

    throw new Error(message);
  }
}

export async function archiveReport(input: {
  organizationId: string;
  actorId: string;
  reportId: string;
}): Promise<void> {
  const report = await prisma.report.findFirst({
    where: { id: input.reportId, organizationId: input.organizationId },
  });
  if (!report) throw new Error("Report not found");

  await prisma.report.update({
    where: { id: report.id },
    data: { status: "ARCHIVED" },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "REPORT_ARCHIVED",
    resourceType: "Report",
    resourceId: report.id,
    metadata: { clientId: report.clientId },
  });
}

export async function getReportPdfBuffer(input: {
  organizationId: string;
  actorId: string;
  reportId: string;
}): Promise<{ buffer: Buffer; fileName: string }> {
  const report = await prisma.report.findFirst({
    where: { id: input.reportId, organizationId: input.organizationId },
  });
  if (!report) throw new Error("Report not found");
  if (report.status !== "READY" && report.status !== "ARCHIVED") {
    throw new Error("Report PDF is not available");
  }
  if (!report.storageKey) throw new Error("Report file not found");

  const buffer = await readReportPdf(report.storageKey);

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "REPORT_DOWNLOADED",
    resourceType: "Report",
    resourceId: report.id,
    metadata: { clientId: report.clientId },
  });

  return {
    buffer,
    fileName: report.fileName ?? `report-${report.id}.pdf`,
  };
}

export function getSnapshotFromReport(
  report: { generatedData: unknown }
): SecurityPostureReportSnapshot | null {
  if (!report.generatedData || typeof report.generatedData !== "object") {
    return null;
  }
  return report.generatedData as SecurityPostureReportSnapshot;
}

function slugify(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "Client";
}
