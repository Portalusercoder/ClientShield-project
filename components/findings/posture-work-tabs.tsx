"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  {
    id: "findings",
    label: "Findings",
    href: "/vulnerabilities",
    description: "Triage observations",
  },
  {
    id: "remediation",
    label: "Remediation",
    href: "/vulnerabilities?view=remediation",
    description: "Track remediation tasks",
  },
] as const;

export function PostureWorkTabs({ active }: { active: "findings" | "remediation" }) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const current =
    active === "remediation" || view === "remediation" ? "remediation" : "findings";

  return (
    <div
      className="flex flex-wrap gap-1 border-b border-border"
      role="tablist"
      aria-label="Posture work"
    >
      {TABS.map((tab) => {
        const selected = current === tab.id;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            role="tab"
            aria-selected={selected}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t",
              selected
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
