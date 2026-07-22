"use client";

import { FindingsFiltersBar } from "@/components/findings/findings-filters";
import { FindingsTable } from "@/components/findings/findings-table";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import type { FindingListResult } from "@/types/findings";

interface FindingsPageClientProps {
  data: FindingListResult;
  currentSearch?: string;
  currentClientId?: string;
  currentAssetId?: string;
  currentSeverity?: string;
  currentStatus?: string;
  currentSource?: string;
  currentPriority?: string;
  currentNeedsTriage?: boolean;
  currentAssignedToUserId?: string;
}

export function FindingsPageClient({
  data,
  currentSearch,
  currentClientId = "ALL",
  currentAssetId = "ALL",
  currentSeverity = "ALL",
  currentStatus = "ALL",
  currentSource = "ALL",
  currentPriority = "ALL",
  currentNeedsTriage = false,
  currentAssignedToUserId = "ALL",
}: FindingsPageClientProps) {
  const cards = [
    {
      label: "Needs Triage",
      value: data.summary.needsTriage,
      tone: "text-severity-high",
    },
    {
      label: "Validated",
      value: data.summary.validated,
      tone: "text-accent",
    },
    {
      label: "In Remediation",
      value: data.summary.inRemediation,
      tone: "text-severity-medium",
    },
    {
      label: "Accepted Risk",
      value: data.summary.acceptedRisk,
      tone: "text-muted",
    },
    {
      label: "Overdue",
      value: data.summary.overdue,
      tone: "text-danger",
    },
    {
      label: "Resolved This Month",
      value: data.summary.resolvedThisMonth,
      tone: "text-success",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Findings Management
        </h1>
        <p className="mt-1 text-sm text-muted">
          Analyst triage for scanner observations and validated findings.
          Counts are unique Findings — not FindingInstances.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className={`text-2xl tabular-nums ${card.tone}`}>
                {formatNumber(card.value)}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <FindingsFiltersBar
        clients={data.clients}
        assets={data.assets}
        users={data.users}
        currentSearch={currentSearch}
        currentClientId={currentClientId}
        currentAssetId={currentAssetId}
        currentSeverity={currentSeverity}
        currentStatus={currentStatus}
        currentSource={currentSource}
        currentPriority={currentPriority}
        currentNeedsTriage={currentNeedsTriage}
        currentAssignedToUserId={currentAssignedToUserId}
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {data.total} finding{data.total !== 1 ? "s" : ""}
        </p>
      </div>

      <FindingsTable findings={data.findings} />
    </div>
  );
}
