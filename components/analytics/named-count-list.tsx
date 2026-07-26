import Link from "next/link";
import type { AnalyticsNamedCount } from "@/types/analytics";

export function NamedCountList({
  rows,
  hrefFor,
  emptyLabel = "Nothing to show",
}: {
  rows: AnalyticsNamedCount[];
  hrefFor?: (row: AnalyticsNamedCount) => string | null;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {rows.map((row, idx) => {
        const href = hrefFor?.(row) ?? null;
        return (
          <li
            key={`${row.id ?? row.name}-${idx}`}
            className="flex items-center justify-between gap-3 py-2 text-sm"
          >
            {href ? (
              <Link href={href} className="truncate text-accent hover:underline">
                {row.name}
              </Link>
            ) : (
              <span className="truncate text-foreground">{row.name}</span>
            )}
            <span className="shrink-0 tabular-nums text-muted">{row.count}</span>
          </li>
        );
      })}
    </ul>
  );
}
