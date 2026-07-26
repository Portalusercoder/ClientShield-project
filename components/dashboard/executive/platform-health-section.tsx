import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import type { ExecutivePlatformHealth } from "@/types/executive-dashboard";

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

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`text-sm font-medium tabular-nums capitalize ${tone ?? "text-foreground"}`}>
        {value}
      </dd>
    </div>
  );
}

export function ExecutivePlatformHealthSection({
  health,
}: {
  health: ExecutivePlatformHealth;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Platform Health</h2>
        <p className="text-sm text-muted">
          Read-only HealthService snapshot — no polling.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">System Status</CardTitle>
          <CardDescription>
            Overall{" "}
            <span className={`font-medium capitalize ${statusTone(health.overallStatus)}`}>
              {health.overallStatus}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl>
            <Row
              label="Application"
              value={health.application}
              tone={statusTone(health.application)}
            />
            <Row
              label="Database"
              value={
                health.databaseLatencyMs != null
                  ? `${health.database} · ${health.databaseLatencyMs}ms`
                  : health.database
              }
              tone={statusTone(health.database)}
            />
            <Row
              label="Wazuh Worker"
              value={health.wazuhWorker}
              tone={statusTone(health.wazuhWorker)}
            />
            <Row
              label="SLA Worker"
              value={health.slaWorker}
              tone={statusTone(health.slaWorker)}
            />
            <Row
              label="Last Sync"
              value={
                health.lastSyncAt
                  ? formatDateTime(new Date(health.lastSyncAt))
                  : "—"
              }
            />
            <Row
              label="Last Health Check"
              value={formatDateTime(new Date(health.lastHealthCheckAt))}
            />
            <Row
              label="Build Version"
              value={`${health.buildVersion}${health.gitSha && health.gitSha !== "unknown" ? ` · ${health.gitSha.slice(0, 7)}` : ""}`}
            />
          </dl>
        </CardContent>
      </Card>
    </section>
  );
}
