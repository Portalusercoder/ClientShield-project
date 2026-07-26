"use client";

import { SecurityEventsFilters } from "@/components/security-events/security-events-filters";
import { SecurityEventsTable } from "@/components/security-events/security-events-table";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryStrip } from "@/components/ui/summary-strip";
import type { SecurityEventListResult } from "@/types/security-events";

interface SecurityEventsPageClientProps {
  data: SecurityEventListResult;
  currentSearch?: string;
  currentClientId?: string;
  currentAssetId?: string;
  currentSeverity?: string;
  currentStatus?: string;
  currentClassification?: string;
  currentSource?: string;
  currentAgentId?: string;
  currentRuleId?: string;
  currentDateFrom?: string;
  currentDateTo?: string;
  currentSort?: string;
}

export function SecurityEventsPageClient({
  data,
  currentSearch,
  currentClientId,
  currentAssetId,
  currentSeverity,
  currentStatus,
  currentClassification,
  currentSource,
  currentAgentId,
  currentRuleId,
  currentDateFrom,
  currentDateTo,
  currentSort,
}: SecurityEventsPageClientProps) {
  const cards = [
    {
      label: "New Events",
      value: data.summary.newEvents,
      tone: "text-severity-high",
    },
    {
      label: "Critical",
      value: data.summary.critical,
      tone: "text-severity-critical",
    },
    {
      label: "High",
      value: data.summary.high,
      tone: "text-severity-high",
    },
    {
      label: "Unmapped",
      value: data.summary.unmapped,
      tone: "text-severity-medium",
    },
    {
      label: "Escalated",
      value: data.summary.escalated,
      tone: "text-accent",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security Events"
        description="Triage correlated detections first — Actionable needs attention; Informational is context; Noisy/Ignored are low-value or policy-denied."
      />

      <SummaryStrip columns={5} metrics={cards} />

      <SecurityEventsFilters
        data={data}
        currentSearch={currentSearch}
        currentClientId={currentClientId}
        currentAssetId={currentAssetId}
        currentSeverity={currentSeverity}
        currentStatus={currentStatus}
        currentClassification={currentClassification}
        currentSource={currentSource}
        currentAgentId={currentAgentId}
        currentRuleId={currentRuleId}
        currentDateFrom={currentDateFrom}
        currentDateTo={currentDateTo}
        currentSort={currentSort}
      />

      <SecurityEventsTable
        events={data.events}
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
      />
    </div>
  );
}
