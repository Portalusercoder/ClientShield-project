import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDurationMs } from "@/services/analytics/shared";
import type { DurationMetricWithTrends } from "@/types/analytics";

export function KpiTrendCard({
  title,
  description,
  metric,
}: {
  title: string;
  description: string;
  metric: DurationMetricWithTrends;
}) {
  const windows = [
    { label: "Current", value: metric.current },
    { label: "7d", value: metric.d7 },
    { label: "30d", value: metric.d30 },
    { label: "90d", value: metric.d90 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-3xl font-semibold tabular-nums text-foreground">
            {formatDurationMs(metric.current.meanMs)}
          </p>
          <p className="mt-1 text-xs text-muted">
            Mean · n={metric.current.sampleCount} · median{" "}
            {formatDurationMs(metric.current.medianMs)} · p95{" "}
            {formatDurationMs(metric.current.p95Ms)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {windows.map((w) => (
            <div
              key={w.label}
              className="rounded-md border border-border bg-surface-elevated px-2 py-2"
            >
              <p className="text-[10px] uppercase tracking-wider text-muted">
                {w.label}
              </p>
              <p className="mt-1 text-sm font-medium tabular-nums">
                {formatDurationMs(w.value.meanMs)}
              </p>
              <p className="text-[10px] text-muted">n={w.value.sampleCount}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
