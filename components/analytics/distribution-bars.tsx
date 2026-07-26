import { cn } from "@/lib/utils";
import type { AnalyticsDistributionRow } from "@/types/analytics";

const SEVERITY_BAR: Record<string, string> = {
  CRITICAL: "bg-severity-critical",
  HIGH: "bg-severity-high",
  MEDIUM: "bg-severity-medium",
  LOW: "bg-severity-low",
  INFO: "bg-severity-info",
};

export function DistributionBars({
  rows,
  emptyLabel = "No data in range",
}: {
  rows: AnalyticsDistributionRow[];
  emptyLabel?: string;
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (rows.length === 0 || total === 0) {
    return <p className="text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-elevated">
        {rows.map((row) => {
          const width = (row.count / total) * 100;
          if (width === 0) return null;
          return (
            <div
              key={row.key}
              className={cn("h-full", SEVERITY_BAR[row.key] ?? "bg-accent")}
              style={{ width: `${width}%` }}
              title={`${row.label}: ${row.count}`}
            />
          );
        })}
      </div>
      <ul className="space-y-1.5 text-sm">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-2">
            <span className="text-muted">{row.label}</span>
            <span className="font-medium tabular-nums text-foreground">
              {row.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
