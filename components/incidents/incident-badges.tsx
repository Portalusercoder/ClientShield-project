import type { IncidentSeverity, IncidentStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES: Record<IncidentSeverity, string> = {
  CRITICAL:
    "bg-severity-critical/15 text-severity-critical border-severity-critical/30",
  HIGH: "bg-severity-high/15 text-severity-high border-severity-high/30",
  MEDIUM:
    "bg-severity-medium/15 text-severity-medium border-severity-medium/30",
  LOW: "bg-severity-low/15 text-severity-low border-severity-low/30",
  INFO: "bg-severity-info/15 text-severity-info border-severity-info/30",
};

const STATUS_STYLES: Record<IncidentStatus, string> = {
  OPEN: "bg-severity-high/15 text-severity-high border-severity-high/30",
  ACKNOWLEDGED: "bg-accent/15 text-accent border-accent/30",
  INVESTIGATING: "bg-severity-medium/15 text-severity-medium border-severity-medium/30",
  CONTAINED: "bg-severity-low/15 text-severity-low border-severity-low/30",
  ERADICATED: "bg-accent/10 text-accent border-accent/20",
  RECOVERING: "bg-severity-info/15 text-severity-info border-severity-info/30",
  RESOLVED: "bg-success/15 text-success border-success/30",
  CLOSED: "bg-muted/20 text-muted border-border",
};

export function IncidentSeverityBadge({
  severity,
  className,
}: {
  severity: IncidentSeverity;
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

export function IncidentStatusBadge({
  status,
  className,
}: {
  status: IncidentStatus;
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
