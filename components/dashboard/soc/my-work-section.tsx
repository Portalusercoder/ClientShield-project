import Link from "next/link";
import { SeverityBadge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/dashboard/stat-card";
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
      <SectionHeader
        title="Assigned to me"
        description="Your claimed work — continue in the Work queue for the full urgency board."
        action={{ label: "Open Work queue", href: "/attention" }}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="block rounded-[8px] outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div
              className={`rounded-[8px] border bg-surface px-5 py-4 shadow-card ${
                severityVariant(card.highestSeverity) === "critical"
                  ? "border-severity-critical/40"
                  : severityVariant(card.highestSeverity) === "high"
                    ? "border-severity-high/40"
                    : "border-border"
              }`}
            >
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
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
              <p className="mt-2 text-xs font-medium text-accent">Continue →</p>
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
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="text-xs text-muted">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {metrics.map((m) =>
          m.href ? (
            <Link
              key={m.label}
              href={m.href}
              className="block rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <StatCard label={m.label} value={m.value} variant={m.variant} />
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
