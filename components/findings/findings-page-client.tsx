"use client";

import { FindingsFiltersBar } from "@/components/findings/findings-filters";
import { FindingsTable } from "@/components/findings/findings-table";
import { PostureWorkTabs } from "@/components/findings/posture-work-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryStrip } from "@/components/ui/summary-strip";
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
      <PageHeader
        title="Findings"
        description="Posture work — triage findings here, then track remediation tasks on the Remediation tab."
      />

      <PostureWorkTabs active="findings" />

      <SummaryStrip metrics={cards} />

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
