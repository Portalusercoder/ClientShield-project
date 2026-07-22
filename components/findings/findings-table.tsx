"use client";

import Link from "next/link";
import {
  FindingSourceBadge,
  FindingStatusBadge,
} from "@/components/findings/finding-badges";
import { SeverityBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import type { FindingListItem } from "@/types/findings";

export function FindingsTable({ findings }: { findings: FindingListItem[] }) {
  if (findings.length === 0) {
    return (
      <EmptyState
        title="No findings match your filters"
        description="Run a passive security check on an authorized website asset, or clear filters to see existing findings."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-elevated">
            <th className="px-4 py-3 font-medium text-muted">Finding</th>
            <th className="px-4 py-3 font-medium text-muted">Client</th>
            <th className="px-4 py-3 font-medium text-muted">Asset</th>
            <th className="px-4 py-3 font-medium text-muted">Severity</th>
            <th className="px-4 py-3 font-medium text-muted">Priority</th>
            <th className="px-4 py-3 font-medium text-muted">Instances</th>
            <th className="px-4 py-3 font-medium text-muted">Source</th>
            <th className="px-4 py-3 font-medium text-muted">Status</th>
            <th className="hidden px-4 py-3 font-medium text-muted lg:table-cell">
              Assigned To
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted xl:table-cell">
              Last Detected
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted md:table-cell">
              Due Date
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {findings.map((finding) => (
            <tr key={finding.id} className="bg-surface hover:bg-surface-elevated/50">
              <td className="px-4 py-3">
                <Link
                  href={`/vulnerabilities/${finding.id}`}
                  className="font-medium text-foreground hover:text-accent"
                >
                  {finding.title}
                </Link>
                {finding.code && (
                  <p className="text-xs text-muted">{finding.code}</p>
                )}
              </td>
              <td className="px-4 py-3 text-muted">
                {finding.clientName ?? "—"}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/assets/${finding.assetId}`}
                  className="text-muted hover:text-accent"
                >
                  {finding.assetName}
                </Link>
              </td>
              <td className="px-4 py-3">
                <SeverityBadge severity={finding.severity} />
              </td>
              <td className="px-4 py-3 text-xs text-muted">
                {finding.triagePriority ?? "—"}
              </td>
              <td className="px-4 py-3 tabular-nums text-muted">
                {finding.instanceCount > 0 ? finding.instanceCount : "—"}
              </td>
              <td className="px-4 py-3">
                <FindingSourceBadge source={finding.source} />
              </td>
              <td className="px-4 py-3">
                <FindingStatusBadge status={finding.status} />
              </td>
              <td className="hidden px-4 py-3 text-muted lg:table-cell">
                {finding.assignedToName ?? "Unassigned"}
              </td>
              <td className="hidden px-4 py-3 text-muted xl:table-cell">
                {formatDate(finding.lastDetectedAt)}
              </td>
              <td className="hidden px-4 py-3 md:table-cell">
                {finding.dueDate ? (
                  <span
                    className={
                      finding.isOverdue ? "text-danger" : "text-muted"
                    }
                  >
                    {formatDate(finding.dueDate)}
                    {finding.isOverdue ? " (overdue)" : ""}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
