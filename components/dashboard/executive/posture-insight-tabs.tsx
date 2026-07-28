"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export function PostureInsightTabs({
  active,
  rangeDays,
}: {
  active: "now" | "analytics";
  rangeDays?: number;
}) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const current =
    active === "analytics" || view === "analytics" ? "analytics" : "now";
  const range = rangeDays ?? Number(searchParams.get("range") || 30);
  const analyticsHref = `/executive?view=analytics&range=${Number.isFinite(range) ? range : 30}`;

  return (
    <div
      className="flex flex-wrap gap-1 border-b border-border"
      role="tablist"
      aria-label="Security posture insights"
    >
      <Link
        href="/executive"
        role="tab"
        aria-selected={current === "now"}
        className={cn(
          "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t",
          current === "now"
            ? "border-accent text-accent"
            : "border-transparent text-muted hover:text-foreground"
        )}
      >
        Now
      </Link>
      <Link
        href={analyticsHref}
        role="tab"
        aria-selected={current === "analytics"}
        className={cn(
          "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t",
          current === "analytics"
            ? "border-accent text-accent"
            : "border-transparent text-muted hover:text-foreground"
        )}
      >
        Over time
      </Link>
    </div>
  );
}
