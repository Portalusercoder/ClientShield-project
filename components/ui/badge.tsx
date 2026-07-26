import type { FindingSeverity } from "@prisma/client";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES: Record<FindingSeverity, string> = {
  CRITICAL:
    "bg-red-50 text-red-700 border-red-200",
  HIGH: "bg-orange-50 text-orange-700 border-orange-200",
  MEDIUM: "bg-amber-50 text-amber-800 border-amber-200",
  LOW: "bg-blue-50 text-blue-700 border-blue-200",
  INFO: "bg-gray-50 text-gray-600 border-gray-200",
};

interface SeverityBadgeProps {
  severity: FindingSeverity | string;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const key = String(severity).toUpperCase() as FindingSeverity;
  const styles = SEVERITY_STYLES[key] ?? SEVERITY_STYLES.INFO;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        styles,
        className
      )}
    >
      {severity}
    </span>
  );
}

interface ScoreBadgeProps {
  score: number;
  className?: string;
}

export function ScoreBadge({ score, className }: ScoreBadgeProps) {
  const color =
    score >= 80
      ? "text-success"
      : score >= 60
        ? "text-warning"
        : "text-danger";

  return (
    <span
      className={cn(
        "text-sm font-semibold tabular-nums",
        color,
        className
      )}
    >
      {score}
    </span>
  );
}
