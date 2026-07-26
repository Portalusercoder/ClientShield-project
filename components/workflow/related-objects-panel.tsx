"use client";

import Link from "next/link";
import type { WorkflowRelatedObject } from "@/lib/workflow/workflow-context";

interface RelatedObjectsPanelProps {
  title?: string;
  objects: WorkflowRelatedObject[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionHref?: string | null;
  emptyActionLabel?: string | null;
}

export function RelatedObjectsPanel({
  title = "Related",
  objects,
  emptyTitle = "No related objects",
  emptyDescription = "Nothing is linked in this workflow yet.",
  emptyActionHref,
  emptyActionLabel,
}: RelatedObjectsPanelProps) {
  return (
    <div className="rounded-md border border-border px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-muted">{title}</p>
      {objects.length === 0 ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="text-xs text-muted">{emptyDescription}</p>
          {emptyActionHref && emptyActionLabel ? (
            <Link
              href={emptyActionHref}
              className="inline-block text-xs font-medium text-accent hover:underline"
            >
              {emptyActionLabel}
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {objects.map((obj) => (
            <li key={`${obj.kind}-${obj.id}`}>
              <Link
                href={obj.href}
                className="text-sm text-accent hover:underline"
              >
                {obj.label}
              </Link>
              {obj.meta ? (
                <span className="ml-2 text-xs text-muted">{obj.meta}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
