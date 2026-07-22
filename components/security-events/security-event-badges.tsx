import type {
  SecurityEventClassification,
  SecurityEventSeverity,
  SecurityEventStatus,
} from "@prisma/client";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES: Record<SecurityEventSeverity, string> = {
  CRITICAL:
    "bg-severity-critical/15 text-severity-critical border-severity-critical/30",
  HIGH: "bg-severity-high/15 text-severity-high border-severity-high/30",
  MEDIUM:
    "bg-severity-medium/15 text-severity-medium border-severity-medium/30",
  LOW: "bg-severity-low/15 text-severity-low border-severity-low/30",
  INFO: "bg-severity-info/15 text-severity-info border-severity-info/30",
};

const STATUS_STYLES: Record<SecurityEventStatus, string> = {
  NEW: "bg-severity-high/15 text-severity-high border-severity-high/30",
  REVIEWING:
    "bg-severity-medium/15 text-severity-medium border-severity-medium/30",
  ACKNOWLEDGED: "bg-accent/15 text-accent border-accent/30",
  ESCALATED:
    "bg-severity-critical/10 text-severity-critical border-severity-critical/20",
  DISMISSED: "bg-muted/20 text-muted border-border",
};

const CLASSIFICATION_STYLES: Record<SecurityEventClassification, string> = {
  ACTIONABLE: "bg-severity-high/15 text-severity-high border-severity-high/30",
  INFORMATIONAL:
    "bg-severity-info/15 text-severity-info border-severity-info/30",
  NOISY: "bg-warning/15 text-warning border-warning/30",
  IGNORED: "bg-muted/20 text-muted border-border",
};

export function SecurityEventSeverityBadge({
  severity,
  className,
}: {
  severity: SecurityEventSeverity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
        SEVERITY_STYLES[severity],
        className
      )}
    >
      {severity}
    </span>
  );
}

export function SecurityEventStatusBadge({
  status,
  className,
}: {
  status: SecurityEventStatus;
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
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function SecurityEventClassificationBadge({
  classification,
  className,
}: {
  classification: SecurityEventClassification;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
        CLASSIFICATION_STYLES[classification],
        className
      )}
    >
      {classification}
    </span>
  );
}
