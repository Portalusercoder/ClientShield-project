import type { ClientStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<ClientStatus, string> = {
  ACTIVE: "bg-success/15 text-success border-success/30",
  INACTIVE: "bg-muted/15 text-muted border-border",
  ONBOARDING: "bg-accent/15 text-accent border-accent/30",
};

const STATUS_LABELS: Record<ClientStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ONBOARDING: "Onboarding",
};

interface ClientStatusBadgeProps {
  status: ClientStatus;
  className?: string;
}

export function ClientStatusBadge({ status, className }: ClientStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

interface SecurityScoreIndicatorProps {
  score: number | null;
  className?: string;
}

export function SecurityScoreIndicator({
  score,
  className,
}: SecurityScoreIndicatorProps) {
  if (score === null) {
    return <span className={cn("text-sm text-muted", className)}>—</span>;
  }

  const color =
    score >= 80
      ? "text-success"
      : score >= 60
        ? "text-warning"
        : "text-danger";

  return (
    <span className={cn("text-sm font-semibold tabular-nums", color, className)}>
      {score.toFixed(0)}
    </span>
  );
}
