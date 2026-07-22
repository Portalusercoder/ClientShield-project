"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const STATUSES = [
  "OPEN",
  "INVESTIGATING",
  "CONFIRMED",
  "DISMISSED",
  "LINKED_TO_INCIDENT",
  "CLOSED",
];

const CREATED_BY = ["SYSTEM_SUGGESTED", "ANALYST_CREATED"];

interface InvestigationsFiltersProps {
  currentStatus?: string;
  currentCreatedByType?: string;
}

export function InvestigationsFilters({
  currentStatus = "ALL",
  currentCreatedByType = "ALL",
}: InvestigationsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value || value === "ALL") params.delete(key);
      else params.set(key, value);
      params.delete("page");
      router.push(`/investigations?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
      <select
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={currentStatus}
        onChange={(e) => update("status", e.target.value)}
        aria-label="Filter by status"
      >
        <option value="ALL">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <select
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={currentCreatedByType}
        onChange={(e) => update("createdByType", e.target.value)}
        aria-label="Filter by source"
      >
        <option value="ALL">All sources</option>
        {CREATED_BY.map((s) => (
          <option key={s} value={s}>
            {s === "SYSTEM_SUGGESTED" ? "System suggested" : "Analyst created"}
          </option>
        ))}
      </select>
    </div>
  );
}
