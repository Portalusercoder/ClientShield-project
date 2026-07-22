import type { FindingSeverity } from "@prisma/client";
import { cn } from "@/lib/utils";
import type { SeverityDistribution } from "@/types/dashboard";

interface SeverityBadgeProps {
  severity: FindingSeverity;
  className?: string;
}

const severityStyles: Record<FindingSeverity, string> = {
  CRITICAL: "bg-severity-critical/15 text-severity-critical border-severity-critical/30",
  HIGH: "bg-severity-high/15 text-severity-high border-severity-high/30",
  MEDIUM: "bg-severity-medium/15 text-severity-medium border-severity-medium/30",
  LOW: "bg-severity-low/15 text-severity-low border-severity-low/30",
  INFO: "bg-severity-info/15 text-severity-info border-severity-info/30",
};

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
        severityStyles[severity],
        className
      )}
    >
      {severity}
    </span>
  );
}

interface SeverityDistributionChartProps {
  data: SeverityDistribution[];
}

export function SeverityDistributionChart({
  data,
}: SeverityDistributionChartProps) {
  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-elevated">
        {data.map((item) => {
          const width = total > 0 ? (item.count / total) * 100 : 0;
          if (width === 0) return null;

          return (
            <div
              key={item.severity}
              className={cn("h-full", item.color)}
              style={{ width: `${width}%` }}
              title={`${item.severity}: ${item.count}`}
            />
          );
        })}
      </div>

      <ul className="space-y-2">
        {data.map((item) => (
          <li
            key={item.severity}
            className="flex items-center justify-between text-sm"
          >
            <div className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", item.color)} />
              <span className="text-muted">{item.severity}</span>
            </div>
            <span className="font-medium tabular-nums text-foreground">
              {item.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
