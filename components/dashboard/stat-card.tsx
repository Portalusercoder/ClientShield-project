import { cn, formatNumber } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  variant?: "default" | "critical" | "high" | "warning" | "success";
  className?: string;
  hint?: string;
}

const valueStyles = {
  default: "text-foreground",
  critical: "text-severity-critical",
  high: "text-severity-high",
  warning: "text-warning",
  success: "text-success",
};

export function StatCard({
  label,
  value,
  suffix,
  variant = "default",
  className,
  hint,
}: StatCardProps) {
  const displayValue =
    typeof value === "number" ? formatNumber(value) : value;

  return (
    <div
      className={cn(
        "rounded-[8px] border border-border bg-surface px-5 py-4 shadow-card",
        className
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums tracking-tight",
          valueStyles[variant]
        )}
      >
        {displayValue}
        {suffix && (
          <span className="ml-1 text-base font-normal text-muted">
            {suffix}
          </span>
        )}
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
