import Link from "next/link";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: { label: string; href: string };
  className?: string;
  /** Visually de-emphasize secondary sections */
  tone?: "primary" | "secondary";
}

export function SectionHeader({
  title,
  description,
  action,
  className,
  tone = "primary",
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <h2
          className={cn(
            "font-semibold tracking-tight text-foreground",
            tone === "primary" ? "text-lg" : "text-base"
          )}
        >
          {title}
        </h2>
        {description ? (
          <p
            className={cn(
              "max-w-2xl text-muted",
              tone === "primary" ? "text-sm" : "text-xs"
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="shrink-0 text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
