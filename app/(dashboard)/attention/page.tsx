import type { Metadata } from "next";
import { Suspense } from "react";
import { AttentionPageClient } from "@/components/attention/attention-page-client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listAttentionItems } from "@/services/attention/attention.service";
import type {
  AttentionAttributionFilter,
  AttentionFilters,
  AttentionOverdueFilter,
  AttentionSeverity,
  AttentionSourceType,
} from "@/types/attention";

export const metadata: Metadata = {
  title: "Attention",
};

export const dynamic = "force-dynamic";

interface AttentionPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function str(
  params: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = params[key];
  return typeof v === "string" ? v : undefined;
}

const SOURCE_TYPES = new Set([
  "SECURITY_EVENT",
  "FINDING",
  "INVESTIGATION",
  "INCIDENT",
]);

export default async function AttentionPage({ searchParams }: AttentionPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  const clientIdRaw = str(params, "clientId");
  const sourceTypeRaw = str(params, "sourceType");
  const severityRaw = str(params, "severity");
  const statusRaw = str(params, "status");
  const attributionRaw = str(params, "attribution");
  const overdueRaw = str(params, "overdue");
  const pageRaw = str(params, "page");

  const filters: AttentionFilters = {
    clientId:
      clientIdRaw && clientIdRaw !== "ALL" ? clientIdRaw : undefined,
    sourceType:
      sourceTypeRaw &&
      sourceTypeRaw !== "ALL" &&
      SOURCE_TYPES.has(sourceTypeRaw)
        ? (sourceTypeRaw as AttentionSourceType)
        : "ALL",
    severity:
      severityRaw === "CRITICAL" || severityRaw === "HIGH"
        ? (severityRaw as AttentionSeverity)
        : "ALL",
    status: statusRaw && statusRaw !== "ALL" ? statusRaw : "ALL",
    attribution:
      attributionRaw === "ATTRIBUTED" || attributionRaw === "UNATTRIBUTED"
        ? (attributionRaw as AttentionAttributionFilter)
        : "ALL",
    overdue:
      overdueRaw === "OVERDUE"
        ? ("OVERDUE" as AttentionOverdueFilter)
        : "ALL",
    page: pageRaw ? Math.max(1, Number.parseInt(pageRaw, 10) || 1) : 1,
    pageSize: 25,
  };

  const [data, clients] = await Promise.all([
    listAttentionItems(session.organizationId, filters),
    prisma.client.findMany({
      where: {
        organizationId: session.organizationId,
        status: { not: "OFFBOARDED" },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 200,
    }),
  ]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Attention</h1>
        <p className="mt-1 text-sm text-muted">
          Derived SOC queue of HIGH/CRITICAL work across security events,
          findings, investigations, and incidents. Overdue reflects finding due
          dates only — not contractual SLA targets.
        </p>
      </div>

      <Suspense fallback={<div className="text-sm text-muted">Loading…</div>}>
        <AttentionPageClient
          data={data}
          clients={clients}
          currentClientId={clientIdRaw ?? "ALL"}
          currentSourceType={sourceTypeRaw ?? "ALL"}
          currentSeverity={severityRaw ?? "ALL"}
          currentStatus={statusRaw ?? "ALL"}
          currentAttribution={attributionRaw ?? "ALL"}
          currentOverdue={overdueRaw ?? "ALL"}
        />
      </Suspense>
    </div>
  );
}
