import type { IncidentSeverity, InvestigationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getInvestigationById } from "@/services/investigations/investigation-queries.service";
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

/**
 * Investigation Report.
 * listInvestigations does not support owner/severity/date — query org-scoped
 * InvestigationGroup once (batch, no N+1) using model-supported filters.
 */
export async function buildInvestigationReport(input: {
  organizationId: string;
  filters?: ReportFilters;
}): Promise<FrameworkReportDocument> {
  const filters = input.filters ?? {};
  const brand = await withBrand(input.organizationId);
  const { from, to } = resolveDateRange(filters);

  if (filters.investigationId) {
    const detail = await getInvestigationById(
      input.organizationId,
      filters.investigationId
    );
    if (!detail) {
      return buildBaseDocument({
        kind: "INVESTIGATION",
        brand,
        filters,
        summary: "Investigation not found for this organisation.",
        sections: [],
        metadata: { rowCount: 0 },
      });
    }

    const ownerName =
      detail.assignedTo?.name ?? detail.assignedTo?.email ?? null;

    return buildBaseDocument({
      kind: "INVESTIGATION",
      brand,
      filters,
      title: `Investigation Report — ${detail.title}`,
      summary: `${detail.title} (${detail.severity} / ${detail.status}). ${filterLabel(filters)}.`,
      metadata: {
        rowCount: 1,
        status: detail.status,
        severity: detail.severity,
      },
      sections: [
        {
          id: "detail",
          title: "Investigation detail",
          kpis: [
            { label: "Status", value: detail.status },
            { label: "Severity", value: detail.severity },
            { label: "Owner", value: ownerName ?? "Unassigned" },
            { label: "Events", value: String(detail.events.length) },
          ],
          tables: [
            {
              id: "investigation",
              title: "Investigation record",
              columns: [
                { key: "title", label: "Title" },
                { key: "severity", label: "Severity" },
                { key: "status", label: "Status" },
                { key: "owner", label: "Owner" },
                { key: "updatedAt", label: "Updated" },
              ],
              rows: [
                {
                  title: detail.title,
                  severity: detail.severity,
                  status: detail.status,
                  owner: ownerName ?? "",
                  updatedAt: formatReportDateTime(detail.updatedAt),
                },
              ],
            },
          ],
        },
      ],
    });
  }

  const where = {
    organizationId: input.organizationId,
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.status
      ? { status: filters.status as InvestigationStatus }
      : {}),
    ...(filters.severity
      ? { severity: filters.severity as IncidentSeverity }
      : {}),
    ...(filters.ownerUserId ? { assignedToUserId: filters.ownerUserId } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.investigationGroup.count({ where }),
    prisma.investigationGroup.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: REPORT_ROW_LIMIT,
      select: {
        id: true,
        title: true,
        status: true,
        severity: true,
        createdByType: true,
        confidence: true,
        clientId: true,
        createdAt: true,
        updatedAt: true,
        assignedTo: { select: { name: true, email: true } },
        _count: {
          select: { events: { where: { removedAt: null } } },
        },
      },
    }),
  ]);

  const clientIds = [
    ...new Set(
      rows
        .map((r) => r.clientId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const clients =
    clientIds.length === 0
      ? []
      : await prisma.client.findMany({
          where: {
            organizationId: input.organizationId,
            id: { in: clientIds },
          },
          select: { id: true, name: true },
        });
  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));

  const tableRows = rows.map((r) => ({
    title: r.title,
    severity: r.severity,
    status: r.status,
    client: r.clientId ? (clientNameById.get(r.clientId) ?? "") : "",
    owner: r.assignedTo?.name ?? r.assignedTo?.email ?? "",
    events: r._count.events,
    createdBy: r.createdByType,
    confidence: r.confidence,
    updatedAt: formatReportDateTime(r.updatedAt),
  }));

  return buildBaseDocument({
    kind: "INVESTIGATION",
    brand,
    filters,
    summary: `${total} investigation(s) matched (${tableRows.length} included). ${filterLabel(filters)}.`,
    metadata: {
      rowCount: tableRows.length,
      totalMatched: total,
      truncated: total > tableRows.length ? 1 : 0,
    },
    sections: [
      {
        id: "list",
        title: "Investigations",
        kpis: [
          { label: "Matched", value: String(total) },
          { label: "In report", value: String(tableRows.length) },
        ],
        tables: [
          {
            id: "investigations",
            title: "Investigations",
            columns: [
              { key: "title", label: "Title" },
              { key: "severity", label: "Severity" },
              { key: "status", label: "Status" },
              { key: "client", label: "Client" },
              { key: "owner", label: "Owner" },
              { key: "events", label: "Events" },
              { key: "updatedAt", label: "Updated" },
            ],
            rows: tableRows,
          },
        ],
      },
    ],
  });
}
