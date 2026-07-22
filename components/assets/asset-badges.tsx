import { cn } from "@/lib/utils";
import type {
  AssetAuthorizationStatus,
  AssetCriticality,
  AssetEnvironment,
  AssetMonitoringStatus,
  AssetType,
} from "@prisma/client";

const TYPE_LABELS: Record<AssetType, string> = {
  WEBSITE: "Website",
  WEB_APPLICATION: "Web Application",
  API: "API",
  SERVER: "Server",
  WORKSTATION: "Workstation",
  NETWORK_DEVICE: "Network Device",
  DOMAIN: "Domain",
  IOT_DEVICE: "IoT Device",
  OTHER: "Other",
};

const ENV_LABELS: Record<AssetEnvironment, string> = {
  PRODUCTION: "Production",
  STAGING: "Staging",
  DEVELOPMENT: "Development",
  OTHER: "Other",
};

const CRITICALITY_STYLES: Record<AssetCriticality, string> = {
  CRITICAL: "bg-severity-critical/15 text-severity-critical border-severity-critical/30",
  HIGH: "bg-severity-high/15 text-severity-high border-severity-high/30",
  MEDIUM: "bg-severity-medium/15 text-severity-medium border-severity-medium/30",
  LOW: "bg-severity-low/15 text-severity-low border-severity-low/30",
};

const MONITORING_STYLES: Record<AssetMonitoringStatus, string> = {
  ACTIVE: "bg-success/15 text-success border-success/30",
  PAUSED: "bg-warning/15 text-warning border-warning/30",
  INACTIVE: "bg-muted/15 text-muted border-border",
};

const AUTH_STYLES: Record<AssetAuthorizationStatus, string> = {
  AUTHORIZED: "bg-success/15 text-success border-success/30",
  PENDING: "bg-accent/15 text-accent border-accent/30",
  NOT_AUTHORIZED: "bg-danger/15 text-danger border-danger/30",
};

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium",
        className
      )}
    >
      {children}
    </span>
  );
}

export function AssetTypeBadge({ type }: { type: AssetType }) {
  return <Badge className="border-border bg-surface-elevated text-foreground">{TYPE_LABELS[type]}</Badge>;
}

export function AssetEnvironmentBadge({
  environment,
}: {
  environment: AssetEnvironment;
}) {
  return (
    <Badge className="border-border bg-surface-elevated text-muted">
      {ENV_LABELS[environment]}
    </Badge>
  );
}

export function AssetCriticalityBadge({
  criticality,
}: {
  criticality: AssetCriticality;
}) {
  return (
    <Badge className={CRITICALITY_STYLES[criticality]}>{criticality}</Badge>
  );
}

export function AssetMonitoringBadge({
  status,
}: {
  status: AssetMonitoringStatus;
}) {
  return <Badge className={MONITORING_STYLES[status]}>{status}</Badge>;
}

export function AssetAuthorizationBadge({
  status,
}: {
  status: AssetAuthorizationStatus;
}) {
  return (
    <Badge className={AUTH_STYLES[status]}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

export { TYPE_LABELS, ENV_LABELS };
