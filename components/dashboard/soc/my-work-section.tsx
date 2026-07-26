import Link from "next/link";
import { StatCard } from "@/components/dashboard/stat-card";
import { SeverityBadge } from "@/components/ui/badge";
import { formatAgeMs } from "@/services/dashboard/dashboard-aggregates";
import type { MyWorkCard } from "@/types/soc-dashboard";

function severityVariant(
  severity: MyWorkCard["highestSeverity"]
): "default" | "critical" | "high" | "warning" | "success" {
  if (severity === "CRITICAL") return "critical";
  if (severity === "HIGH") return "high";
  if (severity === "MEDIUM") return "warning";
  return "default";
}

export function MyWorkSection({ cards }: { cards: MyWorkCard[] }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">My Work</h2>
        <p className="text-sm text-muted">
          Items assigned or claimed to you across the SOC workflow.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="block rounded-lg outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div
              className={`rounded-lg border bg-surface px-5 py-4 ${
                severityVariant(card.highestSeverity) === "critical"
                  ? "border-severity-critical/40"
                  : severityVariant(card.highestSeverity) === "high"
                    ? "border-severity-high/40"
                    : "border-border"
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                {card.label}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                {card.count}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                {card.highestSeverity !== "NONE" ? (
                  <SeverityBadge severity={card.highestSeverity as never} />
                ) : (
                  <span>No severity</span>
                )}
                <span>·</span>
                <span>Oldest {formatAgeMs(card.oldestAgeMs)}</span>
              </div>
              <p className="mt-2 text-xs font-medium text-accent">View →</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function OverviewMetricGrid({
  title,
  description,
  metrics,
}: {
  title: string;
  description?: string;
  metrics: Array<{
    label: string;
    value: number | string;
    variant?: "default" | "critical" | "high" | "warning" | "success";
    href?: string;
  }>;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="text-sm text-muted">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) =>
          m.href ? (
            <Link
              key={m.label}
              href={m.href}
              className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <StatCard
                label={m.label}
                value={m.value}
                variant={m.variant}
              />
            </Link>
          ) : (
            <StatCard
              key={m.label}
              label={m.label}
              value={m.value}
              variant={m.variant}
            />
          )
        )}
      </div>
    </section>
  );
}
