"use client";

import { PostureWorkTabs } from "@/components/findings/posture-work-tabs";
import { RemediationFiltersBar } from "@/components/remediation/remediation-filters";
import { RemediationTable } from "@/components/remediation/remediation-table";
import { PageHeader } from "@/components/ui/page-header";
import type { RemediationListResult } from "@/types/findings";

interface RemediationPageClientProps {
  data: RemediationListResult;
  canUpdate: boolean;
  currentSearch?: string;
  currentStatus?: string;
  currentSeverity?: string;
  currentAssignedToUserId?: string;
  currentOverdueOnly?: boolean;
  /** When true, show Findings/Remediation tabs (hosted under /vulnerabilities). */
  showPostureTabs?: boolean;
}

export function RemediationPageClient({
  data,
  canUpdate,
  currentSearch,
  currentStatus = "ALL",
  currentSeverity = "ALL",
  currentAssignedToUserId = "ALL",
  currentOverdueOnly = false,
  showPostureTabs = false,
}: RemediationPageClientProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={showPostureTabs ? "Findings" : "Remediation"}
        description={
          showPostureTabs
            ? "Posture work — track remediation tasks linked to findings."
            : "Track remediation tasks linked to security findings across clients and assets."
        }
      />

      {showPostureTabs ? <PostureWorkTabs active="remediation" /> : null}

      <RemediationFiltersBar
        users={data.users}
        currentSearch={currentSearch}
        currentStatus={currentStatus}
        currentSeverity={currentSeverity}
        currentAssignedToUserId={currentAssignedToUserId}
        currentOverdueOnly={currentOverdueOnly}
      />

      <p className="text-sm text-muted">
        {data.total} task{data.total !== 1 ? "s" : ""}
      </p>

      <RemediationTable tasks={data.tasks} canUpdate={canUpdate} />
    </div>
  );
}
