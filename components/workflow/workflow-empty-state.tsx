"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

interface WorkflowEmptyStateProps {
  title: string;
  why: string;
  nextAction: string;
  actionHref?: string | null;
  actionLabel?: string | null;
  secondaryHref?: string | null;
  secondaryLabel?: string | null;
  className?: string;
}

/**
 * Empty state that explains why, what to do next, and available actions.
 */
export function WorkflowEmptyState({
  title,
  why,
  nextAction,
  actionHref,
  actionLabel,
  secondaryHref,
  secondaryLabel,
  className,
}: WorkflowEmptyStateProps) {
  return (
    <EmptyState
      title={title}
      description={`${why} ${nextAction}`}
      className={className}
    >
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="inline-flex items-center justify-center rounded-md border border-accent bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
          >
            {actionLabel}
          </Link>
        ) : null}
        {secondaryHref && secondaryLabel ? (
          <Link
            href={secondaryHref}
            className="inline-flex items-center justify-center rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-foreground hover:bg-border"
          >
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </EmptyState>
  );
}
