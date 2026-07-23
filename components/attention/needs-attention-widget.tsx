import Link from "next/link";
import { formatRelativeTime } from "@/lib/utils";
import type { AttentionSummary } from "@/types/attention";
import { SeverityBadge } from "@/components/ui/badge";

const SOURCE_SHORT: Record<string, string> = {
  SECURITY_EVENT: "SE",
  FINDING: "Finding",
  INVESTIGATION: "Inv",
  INCIDENT: "Incident",
};

export function NeedsAttentionWidget({
  summary,
}: {
  summary: AttentionSummary;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-muted">Needs Attention</h2>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {summary.total}
          </p>
          <p className="text-xs text-muted">
            Live derived queue ·{" "}
            <Link href="/attention" className="text-accent hover:underline">
              View all
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="text-severity-critical">
            {summary.critical} Critical
          </span>
          <span className="text-severity-high">{summary.high} High</span>
          <span className={summary.overdue > 0 ? "text-danger" : "text-muted"}>
            {summary.overdue} Overdue
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ["INCIDENT", summary.bySourceType.INCIDENT],
            ["INVESTIGATION", summary.bySourceType.INVESTIGATION],
            ["SECURITY_EVENT", summary.bySourceType.SECURITY_EVENT],
            ["FINDING", summary.bySourceType.FINDING],
          ] as const
        ).map(([type, count]) => (
          <div
            key={type}
            className="rounded-md border border-border bg-surface-elevated px-2 py-1.5"
          >
            <p className="text-[10px] uppercase tracking-wide text-muted">
              {SOURCE_SHORT[type]}
            </p>
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {count}
            </p>
          </div>
        ))}
      </div>

      {summary.truncated ? (
        <p className="text-xs text-warning">
          Queue bound reached — open Attention for filtered views.
        </p>
      ) : null}

      {summary.topItems.length === 0 ? (
        <p className="text-sm text-muted">No HIGH/CRITICAL items need attention.</p>
      ) : (
        <ul className="divide-y divide-border">
          {summary.topItems.map((item) => (
            <li key={item.key} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase text-muted">
                      {SOURCE_SHORT[item.sourceType]}
                    </span>
                    <SeverityBadge severity={item.severity} />
                    {item.overdue ? (
                      <span className="text-[10px] font-semibold uppercase text-danger">
                        Overdue
                      </span>
                    ) : null}
                  </div>
                  <Link
                    href={item.href}
                    className="block truncate text-sm font-medium text-foreground hover:text-accent"
                  >
                    {item.title}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {item.isUnattributed
                      ? "Unattributed"
                      : item.clientName ?? "—"}
                    {" · "}
                    {formatRelativeTime(item.waitingSince)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
