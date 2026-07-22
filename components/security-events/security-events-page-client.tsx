"use client";

import { SecurityEventsFilters } from "@/components/security-events/security-events-filters";
import { SecurityEventsTable } from "@/components/security-events/security-events-table";
import { formatNumber } from "@/lib/utils";
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
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Security Events
        </h1>
        <p className="mt-1 text-sm text-muted">
          Investigation workspace for correlated Wazuh detections. One row per
          correlated event — use filters to focus analyst attention.
        </p>
        <p className="mt-2 text-xs text-muted">
          Classification:{" "}
          <span className="text-foreground">Actionable</span> requires attention
          · <span className="text-foreground">Informational</span> is useful
          context · <span className="text-foreground">Noisy</span> is
          low-value ingested signal ·{" "}
          <span className="text-foreground">Ignored</span> is policy-denied.
          Filtered indexer alerts (below min level) remain ledgered but do not
          create events.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <p className="text-xs uppercase tracking-wide text-muted">
              {card.label}
            </p>
            <p className={`mt-1 text-2xl font-semibold ${card.tone}`}>
              {formatNumber(card.value)}
            </p>
          </div>
        ))}
      </div>

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
