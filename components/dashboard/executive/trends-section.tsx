import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ExecutiveTrends, TrendPeriodCounts } from "@/types/executive-dashboard";

function TrendRows({ counts }: { counts: TrendPeriodCounts }) {
  const rows: Array<{ label: string; value: number }> = [
    { label: "Incidents created", value: counts.incidentsCreated },
    { label: "Findings created", value: counts.findingsCreated },
    { label: "Investigations opened", value: counts.investigationsOpened },
    { label: "Security events ingested", value: counts.securityEventsIngested },
    { label: "Incidents resolved", value: counts.incidentsResolved },
  ];

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.label}
          className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm last:border-0"
        >
          <span className="text-muted">{r.label}</span>
          <span className="font-medium tabular-nums text-foreground">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function ExecutiveTrendsSection({ trends }: { trends: ExecutiveTrends }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Security Trends</h2>
        <p className="text-sm text-muted">
          On-demand counts from existing timestamps (7 and 30 days).
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Last 7 days</CardTitle>
            <CardDescription>Rolling window from now</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendRows counts={trends.last7Days} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Last 30 days</CardTitle>
            <CardDescription>Rolling window from now</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendRows counts={trends.last30Days} />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
