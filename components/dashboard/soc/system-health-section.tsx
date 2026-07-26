import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import type { SystemHealthDashboardSection } from "@/types/soc-dashboard";

function statusTone(status: string): string {
  switch (status) {
    case "ok":
      return "text-success";
    case "degraded":
    case "stale":
    case "idle":
    case "unknown":
      return "text-warning";
    case "error":
      return "text-severity-critical";
    case "disabled":
      return "text-muted";
    default:
      return "text-foreground";
  }
}

function HealthRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`text-sm font-medium capitalize tabular-nums ${statusTone(value)}`}>
        {value}
      </dd>
    </div>
  );
}

export function SystemHealthSection({
  health,
}: {
  health: SystemHealthDashboardSection;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>System Health</CardTitle>
        <CardDescription>
          Read-only operational status · overall{" "}
          <span className={`font-medium capitalize ${statusTone(health.overallStatus)}`}>
            {health.overallStatus}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl>
          <HealthRow label="Application" value={health.application} />
          <HealthRow label="Database" value={health.database} />
          <HealthRow label="Wazuh Worker" value={health.wazuhWorker} />
          <HealthRow label="SLA Worker" value={health.slaWorker} />
          <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2">
            <dt className="text-sm text-muted">Last Sync</dt>
            <dd className="text-sm font-medium text-foreground">
              {health.lastSyncAt
                ? formatDateTime(new Date(health.lastSyncAt))
                : "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-sm text-muted">Last Health Check</dt>
            <dd className="text-sm font-medium text-foreground">
              {formatDateTime(new Date(health.lastHealthCheckAt))}
              {health.databaseLatencyMs != null
                ? ` · DB ${health.databaseLatencyMs}ms`
                : ""}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
