import { getAssetById, listAssets } from "@/services/assets.service";
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
import type { AssetCriticality, AssetMonitoringStatus } from "@prisma/client";

const CRITICALITY = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const MONITORING = new Set(["ACTIVE", "PAUSED", "INACTIVE"]);

/**
 * Asset Security Report — reuses listAssets / getAssetById.
 */
export async function buildAssetReport(input: {
  organizationId: string;
  filters?: ReportFilters;
}): Promise<FrameworkReportDocument> {
  const filters = input.filters ?? {};
  const brand = await withBrand(input.organizationId);

  if (filters.assetId) {
    const asset = await getAssetById(input.organizationId, filters.assetId);
    if (!asset) {
      return buildBaseDocument({
        kind: "ASSET_SECURITY",
        brand,
        filters,
        summary: "Asset not found for this organisation.",
        sections: [],
        metadata: { rowCount: 0 },
      });
    }
    const rows = [
      {
        name: asset.name,
        type: asset.type,
        criticality: asset.criticality,
        monitoringStatus: asset.monitoringStatus,
        client: asset.clientName,
        securityScore: asset.securityScore,
        hostname: asset.hostname ?? "",
        createdAt: formatReportDateTime(asset.createdAt),
      },
    ];
    return buildBaseDocument({
      kind: "ASSET_SECURITY",
      brand,
      filters,
      title: `Asset Security Report — ${asset.name}`,
      summary: `${asset.name} (${asset.criticality} / ${asset.monitoringStatus}). ${filterLabel(filters)}.`,
      metadata: { rowCount: 1 },
      sections: [
        {
          id: "assets",
          title: "Asset detail",
          kpis: [
            { label: "Score", value: asset.securityScore == null ? "N/A" : String(asset.securityScore) },
            { label: "Criticality", value: asset.criticality },
            { label: "Monitoring", value: asset.monitoringStatus },
            { label: "Client", value: asset.clientName },
          ],
          tables: [
            {
              id: "assets-table",
              title: "Asset",
              columns: [
                { key: "name", label: "Name" },
                { key: "type", label: "Type" },
                { key: "criticality", label: "Criticality" },
                { key: "monitoringStatus", label: "Monitoring" },
                { key: "client", label: "Client" },
                { key: "securityScore", label: "Score" },
                { key: "hostname", label: "Hostname" },
              ],
              rows,
            },
          ],
        },
      ],
    });
  }

  const criticality =
    filters.severity && CRITICALITY.has(filters.severity)
      ? (filters.severity as AssetCriticality)
      : "ALL";
  const monitoringStatus =
    filters.status && MONITORING.has(filters.status)
      ? (filters.status as AssetMonitoringStatus)
      : "ALL";

  const first = await listAssets(input.organizationId, {
    clientId: filters.clientId ?? "ALL",
    criticality,
    monitoringStatus,
    page: 1,
    pageSize: 100,
  });

  let assets = [...first.assets];
  let page = 2;
  while (assets.length < first.total && assets.length < 500) {
    const next = await listAssets(input.organizationId, {
      clientId: filters.clientId ?? "ALL",
      criticality,
      monitoringStatus,
      page,
      pageSize: 100,
    });
    if (next.assets.length === 0) break;
    assets = assets.concat(next.assets);
    page += 1;
    if (page > 20) break;
  }
  assets = assets.slice(0, 500);

  const rows = assets.map((a) => ({
    name: a.name,
    type: a.type,
    criticality: a.criticality,
    monitoringStatus: a.monitoringStatus,
    client: a.clientName,
    securityScore: a.securityScore,
    hostname: a.hostname ?? "",
    createdAt: formatReportDateTime(a.createdAt),
  }));

  return buildBaseDocument({
    kind: "ASSET_SECURITY",
    brand,
    filters,
    summary: `${first.total} asset(s) matched (${rows.length} included). ${filterLabel(filters)}.`,
    metadata: {
      rowCount: rows.length,
      totalMatched: first.total,
      truncated: first.total > rows.length ? 1 : 0,
    },
    sections: [
      {
        id: "assets",
        title: "Asset security inventory",
        kpis: [
          { label: "Matched", value: String(first.total) },
          { label: "In report", value: String(rows.length) },
        ],
        tables: [
          {
            id: "assets-table",
            title: "Assets",
            columns: [
              { key: "name", label: "Name" },
              { key: "type", label: "Type" },
              { key: "criticality", label: "Criticality" },
              { key: "monitoringStatus", label: "Monitoring" },
              { key: "client", label: "Client" },
              { key: "securityScore", label: "Score" },
              { key: "hostname", label: "Hostname" },
            ],
            rows,
          },
        ],
      },
    ],
  });
}
