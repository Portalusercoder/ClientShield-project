import type { ClientOnboardingStatus, ClientStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import type { ReadinessOverall } from "@/types/client-onboarding";

const STATUS_STYLES: Record<ClientStatus, string> = {
  PROSPECT: "bg-muted/15 text-muted border-border",
  ONBOARDING: "bg-accent/15 text-accent border-accent/30",
  ACTIVE: "bg-success/15 text-success border-success/30",
  SUSPENDED: "bg-warning/15 text-warning border-warning/30",
  OFFBOARDED: "bg-muted/15 text-muted border-border",
  INACTIVE: "bg-muted/15 text-muted border-border",
};

const STATUS_LABELS: Record<ClientStatus, string> = {
  PROSPECT: "Prospect",
  ONBOARDING: "Onboarding",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  OFFBOARDED: "Offboarded",
  INACTIVE: "Inactive",
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

const ONBOARDING_STYLES: Record<ClientOnboardingStatus, string> = {
  NOT_STARTED: "bg-muted/15 text-muted border-border",
  IN_PROGRESS: "bg-accent/15 text-accent border-accent/30",
  BLOCKED: "bg-danger/15 text-danger border-danger/30",
  READY: "bg-success/15 text-success border-success/30",
  COMPLETED: "bg-success/15 text-success border-success/30",
};

const ONBOARDING_LABELS: Record<ClientOnboardingStatus, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocked",
  READY: "Ready",
  COMPLETED: "Completed",
};

interface OnboardingStatusBadgeProps {
  status: ClientOnboardingStatus | null;
  className?: string;
}

export function OnboardingStatusBadge({
  status,
  className,
}: OnboardingStatusBadgeProps) {
  if (!status) {
    return <span className={cn("text-sm text-muted", className)}>—</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium",
        ONBOARDING_STYLES[status],
        className
      )}
    >
      {ONBOARDING_LABELS[status]}
    </span>
  );
}

const READINESS_STYLES: Record<ReadinessOverall, string> = {
  READY: "bg-success/15 text-success border-success/30",
  NOT_READY: "bg-warning/15 text-warning border-warning/30",
  BLOCKED: "bg-danger/15 text-danger border-danger/30",
};

const READINESS_LABELS: Record<ReadinessOverall, string> = {
  READY: "Ready",
  NOT_READY: "Not Ready",
  BLOCKED: "Blocked",
};

interface ReadinessBadgeProps {
  overall: ReadinessOverall | null | undefined;
  className?: string;
}

export function ReadinessBadge({ overall, className }: ReadinessBadgeProps) {
  if (!overall) {
    return <span className={cn("text-sm text-muted", className)}>—</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium",
        READINESS_STYLES[overall],
        className
      )}
    >
      {READINESS_LABELS[overall]}
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
