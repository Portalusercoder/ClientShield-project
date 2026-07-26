import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityLink } from "@/components/ui/entity-link";
import { cn } from "@/lib/utils";
import type {
  ExecutiveRiskDistribution,
  NamedRiskRow,
  SeverityCountRow,
} from "@/types/executive-dashboard";

const SEVERITY_BAR: Record<string, string> = {
  CRITICAL: "bg-severity-critical",
  HIGH: "bg-severity-high",
  MEDIUM: "bg-severity-medium",
  LOW: "bg-severity-low",
  INFO: "bg-severity-info",
};

function DistributionList({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: SeverityCountRow[];
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No open items.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-elevated">
              {rows.map((row) => {
                const width = total > 0 ? (row.count / total) * 100 : 0;
                if (width === 0) return null;
                return (
                  <div
                    key={row.severity}
                    className={cn("h-full", SEVERITY_BAR[row.severity] ?? "bg-muted")}
                    style={{ width: `${width}%` }}
                    title={`${row.severity}: ${row.count}`}
                  />
                );
              })}
            </div>
            <ul className="space-y-1.5 text-sm">
              {rows.map((row) => (
                <li
                  key={row.severity}
                  className="flex items-center justify-between"
                >
                  <span className="text-muted">{row.severity}</span>
                  <span className="font-medium tabular-nums">{row.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BucketList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 text-sm">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-center justify-between border-b border-border/40 py-1 last:border-0"
            >
              <span className="text-muted">{row.label}</span>
              <span className="font-medium tabular-nums">{row.count}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function RiskTable({
  title,
  rows,
}: {
  title: string;
  rows: NamedRiskRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>Lowest stored security scores first</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="No records"
            description="Risk ranking appears when scores exist."
            className="py-8"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-2 py-2">
                      <EntityLink href={row.href}>{row.name}</EntityLink>
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {row.securityScore ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ExecutiveRiskSection({
  risk,
}: {
  risk: ExecutiveRiskDistribution;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Risk Distribution</h2>
        <p className="text-sm text-muted">
          Severity mix and highest-risk assets/clients from stored scores.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <DistributionList
          title="Findings by Severity"
          description="Unresolved findings"
          rows={risk.findingsBySeverity}
        />
        <DistributionList
          title="Incidents by Severity"
          description="Open incidents"
          rows={risk.incidentsBySeverity}
        />
        <DistributionList
          title="Security Events by Severity"
          description="Active (new/reviewing/acknowledged)"
          rows={risk.securityEventsBySeverity}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <BucketList title="Asset Risk Distribution" rows={risk.assetRiskBuckets} />
        <BucketList title="Client Risk Distribution" rows={risk.clientRiskBuckets} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <RiskTable title="Top 10 Highest Risk Assets" rows={risk.highestRiskAssets} />
        <RiskTable title="Top 10 Highest Risk Clients" rows={risk.highestRiskClients} />
      </div>
    </section>
  );
}
