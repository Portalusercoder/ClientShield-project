import { cn, formatNumber } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  variant?: "default" | "critical" | "high" | "warning" | "success";
  className?: string;
}

const variantStyles = {
  default: "border-border",
  critical: "border-severity-critical/40",
  high: "border-severity-high/40",
  warning: "border-warning/40",
  success: "border-success/40",
};

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
}: StatCardProps) {
  const displayValue =
    typeof value === "number" ? formatNumber(value) : value;

  return (
    <div
      className={cn(
        "rounded-lg border bg-surface px-5 py-4",
        variantStyles[variant],
        className
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", valueStyles[variant])}>
        {displayValue}
        {suffix && (
          <span className="ml-1 text-base font-normal text-muted">{suffix}</span>
        )}
      </p>
    </div>
  );
}
