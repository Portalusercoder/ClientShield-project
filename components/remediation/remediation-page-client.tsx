"use client";

import { RemediationFiltersBar } from "@/components/remediation/remediation-filters";
import { RemediationTable } from "@/components/remediation/remediation-table";
import type { RemediationListResult } from "@/types/findings";

interface RemediationPageClientProps {
  data: RemediationListResult;
  canUpdate: boolean;
  currentSearch?: string;
  currentStatus?: string;
  currentSeverity?: string;
  currentAssignedToUserId?: string;
  currentOverdueOnly?: boolean;
}

export function RemediationPageClient({
  data,
  canUpdate,
  currentSearch,
  currentStatus = "ALL",
  currentSeverity = "ALL",
  currentAssignedToUserId = "ALL",
  currentOverdueOnly = false,
}: RemediationPageClientProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Remediation Management
        </h1>
        <p className="mt-1 text-sm text-muted">
          Track remediation tasks linked to security findings across clients and
          assets.
        </p>
      </div>

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
