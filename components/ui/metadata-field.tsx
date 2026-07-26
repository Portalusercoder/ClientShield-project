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
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}
