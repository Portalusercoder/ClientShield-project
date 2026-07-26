"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { WorkflowStage } from "@/lib/workflow/workflow-context";

interface WorkflowTrailProps {
  stages: WorkflowStage[];
  className?: string;
}

/**
 * Lightweight analyst workflow trail (Phase 6b5).
 * Shows SE → Investigation → Finding → Incident with clickable completed/available stages.
 */
export function WorkflowTrail({ stages, className }: WorkflowTrailProps) {
  return (
    <nav
      aria-label="Workflow"
      className={cn(
        "rounded-md border border-border bg-surface/40 px-3 py-2",
        className
      )}
    >
      <ol className="flex flex-wrap items-center gap-1 text-xs">
        {stages.map((stage, index) => {
          const isLast = index === stages.length - 1;
          const content =
            stage.href && stage.status !== "current" ? (
              <Link
                href={stage.href}
                className={cn(
                  "rounded px-2 py-1 font-medium transition-colors",
                  stage.status === "completed" || stage.status === "available"
                    ? "text-accent hover:bg-surface-elevated"
                    : "text-muted"
                )}
                title={stage.title ?? stage.label}
              >
                {stage.label}
              </Link>
            ) : (
              <span
                className={cn(
                  "rounded px-2 py-1 font-medium",
                  stage.status === "current"
                    ? "bg-accent/10 text-accent"
                    : stage.status === "empty"
                      ? "text-muted/70"
                      : "text-foreground"
                )}
                title={stage.title ?? stage.label}
              >
                {stage.label}
                {stage.status === "empty" ? " (none)" : null}
              </span>
            );

          return (
            <li key={stage.id} className="flex items-center gap-1">
              {content}
              {!isLast ? (
                <span className="px-0.5 text-muted" aria-hidden>
                  →
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
