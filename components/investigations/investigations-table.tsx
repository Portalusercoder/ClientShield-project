"use client";

import Link from "next/link";
import {
  InvestigationCreatedByBadge,
  InvestigationSeverityBadge,
  InvestigationStatusBadge,
} from "@/components/investigations/investigation-badges";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";
import type { InvestigationListItem } from "@/types/investigations";

export function InvestigationsTable({
  items,
}: {
  items: InvestigationListItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border px-4 py-10 text-center text-sm text-muted">
        No investigations match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Investigation</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Severity</th>
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Confidence</th>
            <th className="px-4 py-3 font-medium">Events</th>
            <th className="px-4 py-3 font-medium">Actionable</th>
            <th className="px-4 py-3 font-medium">Noisy</th>
            <th className="px-4 py-3 font-medium">Rules</th>
            <th className="px-4 py-3 font-medium">First / Last</th>
            <th className="px-4 py-3 font-medium">Explanation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-surface/40">
              <td className="px-4 py-3">
                <Link
                  href={`/investigations/${item.id}`}
                  className="font-medium text-foreground hover:text-accent"
                >
                  {item.title}
                </Link>
                <p className="mt-0.5 text-xs text-muted">
                  Updated {formatRelativeTime(item.updatedAt)}
                </p>
                {item.qualityWarning ? (
                  <p className="mt-1 text-xs text-severity-medium">
                    {item.qualityWarning}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <InvestigationStatusBadge status={item.status} />
              </td>
              <td className="px-4 py-3">
                <InvestigationSeverityBadge severity={item.severity} />
              </td>
              <td className="px-4 py-3">
                <InvestigationCreatedByBadge
                  createdByType={item.createdByType}
                />
              </td>
              <td className="px-4 py-3 text-xs text-muted">
                {item.confidence ?? "—"}
              </td>
              <td className="px-4 py-3 tabular-nums text-muted">
                {item.eventCount}
              </td>
              <td className="px-4 py-3 tabular-nums text-muted">
                {item.actionableEventCount}
              </td>
              <td className="px-4 py-3 tabular-nums text-muted">
                {item.noisyEventCount}
              </td>
              <td className="px-4 py-3 tabular-nums text-muted">
                {item.distinctRuleCount}
              </td>
              <td className="px-4 py-3 text-xs text-muted">
                {item.firstSeenAt || item.lastSeenAt ? (
                  <div className="space-y-0.5">
                    <div>
                      {item.firstSeenAt
                        ? formatDateTime(item.firstSeenAt)
                        : "—"}
                    </div>
                    <div>
                      {item.lastSeenAt
                        ? formatDateTime(item.lastSeenAt)
                        : "—"}
                    </div>
                  </div>
                ) : (
                  formatDateTime(item.updatedAt)
                )}
              </td>
              <td className="max-w-[280px] px-4 py-3 text-muted">
                <span className="line-clamp-2 text-xs">
                  {item.groupingExplanation ?? "—"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
