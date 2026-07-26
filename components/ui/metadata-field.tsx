import type { ReactNode } from "react";

/**
 * Shared metadata field used on entity detail surfaces.
 * Presentational only — no layout redesign.
 */
export function MetadataField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-relaxed text-foreground">
        {value || "—"}
      </dd>
    </div>
  );
}
