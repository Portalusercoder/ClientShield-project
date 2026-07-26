import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils";

export type SummaryMetric = {
  label: string;
  value: number | string;
  href?: string;
  /** Tailwind text color class for the value */
  tone?: string;
};

interface SummaryStripProps {
  metrics: SummaryMetric[];
  className?: string;
  columns?: 3 | 4 | 5 | 6;
}

const COLS: Record<NonNullable<SummaryStripProps["columns"]>, string> = {
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-5",
  6: "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6",
};

/**
 * Compact metric strip for list pages — one visual language across domains.
 */
export function SummaryStrip({
  metrics,
  className,
  columns = 6,
}: SummaryStripProps) {
  return (
    <div
      className={cn(
        "grid gap-3",
        COLS[columns],
        className
      )}
      role="list"
      aria-label="Summary metrics"
    >
      {metrics.map((m) => {
        const value =
          typeof m.value === "number" ? formatNumber(m.value) : m.value;
        const inner = (
          <>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
              {m.label}
            </p>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums tracking-tight",
                m.tone ?? "text-foreground"
              )}
            >
              {value}
            </p>
          </>
        );

        if (m.href) {
          return (
            <Link
              key={m.label}
              href={m.href}
              role="listitem"
              className="rounded-[8px] border border-border bg-surface px-4 py-3 shadow-card transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {inner}
            </Link>
          );
        }

        return (
          <div
            key={m.label}
            role="listitem"
            className="rounded-[8px] border border-border bg-surface px-4 py-3 shadow-card"
          >
            {inner}
          </div>
        );
      })}
    </div>
  );
}
