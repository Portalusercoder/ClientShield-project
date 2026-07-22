import type { FindingSource, FindingStatus, RemediationStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<FindingStatus, string> = {
  OPEN: "bg-severity-high/15 text-severity-high border-severity-high/30",
  VALIDATED: "bg-severity-medium/15 text-severity-medium border-severity-medium/30",
  IN_PROGRESS: "bg-accent/15 text-accent border-accent/30",
  RESOLVED: "bg-success/15 text-success border-success/30",
  ACCEPTED_RISK: "bg-warning/15 text-warning border-warning/30",
  FALSE_POSITIVE: "bg-muted/20 text-muted border-border",
};

const SOURCE_LABELS: Record<FindingSource, string> = {
  PASSIVE_CHECK: "Passive Check",
  OWASP_ZAP: "OWASP ZAP",
  MANUAL: "Manual",
  OTHER: "Other",
};

const REMEDIATION_STATUS_STYLES: Record<RemediationStatus, string> = {
  OPEN: "bg-severity-high/15 text-severity-high border-severity-high/30",
  IN_PROGRESS: "bg-accent/15 text-accent border-accent/30",
  BLOCKED: "bg-warning/15 text-warning border-warning/30",
  COMPLETED: "bg-success/15 text-success border-success/30",
  CANCELLED: "bg-muted/20 text-muted border-border",
};

export function FindingStatusBadge({
  status,
  className,
}: {
  status: FindingStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
        STATUS_STYLES[status],
        className
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function FindingSourceBadge({
  source,
  className,
}: {
  source: FindingSource;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-border bg-surface-elevated px-2 py-0.5 text-xs font-medium text-muted",
        className
      )}
    >
      {SOURCE_LABELS[source]}
    </span>
  );
}

export function RemediationStatusBadge({
  status,
  className,
}: {
  status: RemediationStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
        REMEDIATION_STATUS_STYLES[status],
        className
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export { SOURCE_LABELS };
