import { getClientById, listClients } from "@/services/clients.service";
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
import type { ClientStatus } from "@prisma/client";

/**
 * Client Security Report — reuses listClients / getClientById.
 */
export async function buildClientReport(input: {
  organizationId: string;
  filters?: ReportFilters;
}): Promise<FrameworkReportDocument> {
  const filters = input.filters ?? {};
  const brand = await withBrand(input.organizationId);

  if (filters.clientId) {
    const client = await getClientById(input.organizationId, filters.clientId);
    if (!client) {
      return buildBaseDocument({
        kind: "CLIENT_SECURITY",
        brand,
        filters,
        summary: "Client not found for this organisation.",
        sections: [],
        metadata: { rowCount: 0 },
      });
    }
    const rows = [
      {
        name: client.name,
        status: client.status,
        industry: client.industry ?? "",
        securityScore: client.securityScore,
        assets: client.assetsCount,
        findings: client.openFindingsCount,
        incidents: client.openIncidentsCount,
        investigations: client.openInvestigationsCount,
        onboarding: client.onboardingStatus ?? "",
        createdAt: formatReportDateTime(client.createdAt),
      },
    ];
    return buildBaseDocument({
      kind: "CLIENT_SECURITY",
      brand,
      filters,
      title: `Client Security Report — ${client.name}`,
      summary: `${client.name} (score ${client.securityScore ?? "N/A"}). ${filterLabel(filters)}.`,
      metadata: { rowCount: 1 },
      sections: [
        {
          id: "clients",
          title: "Client detail",
          kpis: [
            {
              label: "Score",
              value:
                client.securityScore == null
                  ? "N/A"
                  : String(client.securityScore),
            },
            { label: "Assets", value: String(client.assetsCount) },
            {
              label: "Open findings",
              value: String(client.openFindingsCount),
            },
            {
              label: "Open incidents",
              value: String(client.openIncidentsCount),
            },
          ],
          tables: [
            {
              id: "clients-table",
              title: "Client",
              columns: [
                { key: "name", label: "Name" },
                { key: "status", label: "Status" },
                { key: "industry", label: "Industry" },
                { key: "securityScore", label: "Score" },
                { key: "assets", label: "Assets" },
                { key: "findings", label: "Open findings" },
                { key: "onboarding", label: "Onboarding" },
              ],
              rows,
            },
          ],
        },
      ],
    });
  }

  const first = await listClients(input.organizationId, {
    status: (filters.status as ClientStatus | "ALL") ?? "ALL",
    page: 1,
    pageSize: 100,
  });

  let clients = [...first.clients];
  let page = 2;
  while (clients.length < first.total && clients.length < 500) {
    const next = await listClients(input.organizationId, {
      status: (filters.status as ClientStatus | "ALL") ?? "ALL",
      page,
      pageSize: 100,
    });
    if (next.clients.length === 0) break;
    clients = clients.concat(next.clients);
    page += 1;
    if (page > 20) break;
  }
  clients = clients.slice(0, 500);

  const rows = clients.map((c) => ({
    name: c.name,
    status: c.status,
    industry: c.industry ?? "",
    securityScore: c.securityScore,
    assets: c.assetsCount,
    findings: c.openFindingsCount,
    incidents: c.openIncidentsCount,
    onboarding: c.onboardingStatus ?? "",
    createdAt: formatReportDateTime(c.createdAt),
  }));

  return buildBaseDocument({
    kind: "CLIENT_SECURITY",
    brand,
    filters,
    summary: `${first.total} client(s) matched (${rows.length} included). ${filterLabel(filters)}.`,
    metadata: {
      rowCount: rows.length,
      totalMatched: first.total,
      truncated: first.total > rows.length ? 1 : 0,
    },
    sections: [
      {
        id: "clients",
        title: "Client security overview",
        kpis: [
          { label: "Matched", value: String(first.total) },
          { label: "In report", value: String(rows.length) },
        ],
        tables: [
          {
            id: "clients-table",
            title: "Clients",
            columns: [
              { key: "name", label: "Name" },
              { key: "status", label: "Status" },
              { key: "industry", label: "Industry" },
              { key: "securityScore", label: "Score" },
              { key: "assets", label: "Assets" },
              { key: "findings", label: "Open findings" },
              { key: "onboarding", label: "Onboarding" },
            ],
            rows,
          },
        ],
      },
    ],
  });
}
