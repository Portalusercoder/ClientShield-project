import type {
  IncidentSeverity,
  InvestigationCreatedByType,
  InvestigationStatus,
} from "@prisma/client";
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

const STATUS_STYLES: Record<InvestigationStatus, string> = {
  OPEN: "bg-severity-high/15 text-severity-high border-severity-high/30",
  INVESTIGATING:
    "bg-severity-medium/15 text-severity-medium border-severity-medium/30",
  CONFIRMED: "bg-accent/15 text-accent border-accent/30",
  DISMISSED: "bg-muted/20 text-muted border-border",
  LINKED_TO_INCIDENT: "bg-success/15 text-success border-success/30",
  CLOSED: "bg-muted/20 text-muted border-border",
};

export function InvestigationSeverityBadge({
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

export function InvestigationStatusBadge({
  status,
  className,
}: {
  status: InvestigationStatus;
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

export function InvestigationCreatedByBadge({
  createdByType,
  className,
}: {
  createdByType: InvestigationCreatedByType;
  className?: string;
}) {
  const isSystem = createdByType === "SYSTEM_SUGGESTED";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
        isSystem
          ? "bg-accent/15 text-accent border-accent/30"
          : "bg-muted/20 text-muted border-border",
        className
      )}
    >
      {isSystem ? "SYSTEM SUGGESTED" : "ANALYST CREATED"}
    </span>
  );
}
