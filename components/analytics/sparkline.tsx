import { cn } from "@/lib/utils";
import type { AnalyticsSeriesPoint } from "@/types/analytics";

/** Lightweight CSS bar sparkline — no chart library. */
export function Sparkline({
  points,
  className,
  tone = "accent",
}: {
  points: AnalyticsSeriesPoint[];
  className?: string;
  tone?: "accent" | "success" | "warning" | "danger";
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const toneClass =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-danger"
          : "bg-accent";

  if (points.length === 0) {
    return (
      <p className={cn("text-xs text-muted", className)}>No trend data</p>
    );
  }

  return (
    <div
      className={cn("flex h-16 items-end gap-0.5", className)}
      role="img"
      aria-label="Trend sparkline"
    >
      {points.map((p) => {
        const h = Math.max(4, (p.value / max) * 100);
        return (
          <div
            key={p.bucket}
            className="flex min-w-0 flex-1 flex-col items-center justify-end"
            title={`${p.label}: ${p.value}`}
          >
            <div
              className={cn("w-full rounded-t-sm opacity-80", toneClass)}
              style={{ height: `${h}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
