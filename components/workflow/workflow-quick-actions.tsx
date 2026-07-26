"use client";

import Link from "next/link";
import type { WorkflowQuickAction } from "@/lib/workflow/workflow-context";

interface WorkflowQuickActionsProps {
  actions: WorkflowQuickAction[];
  title?: string;
}

/** Only renders available actions with hrefs (invalid/unavailable omitted). */
export function WorkflowQuickActions({
  actions,
  title = "Quick actions",
}: WorkflowQuickActionsProps) {
  const visible = actions.filter((a) => a.available && a.href);
  if (visible.length === 0) return null;

  return (
    <div className="rounded-md border border-border px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-muted">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {visible.map((action) => (
          <Link
            key={action.id}
            href={action.href!}
            className="inline-flex items-center justify-center rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-foreground hover:bg-border"
          >
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
