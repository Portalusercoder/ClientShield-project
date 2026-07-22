"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { SecurityEventListResult } from "@/types/security-events";

interface SecurityEventsFiltersProps {
  data: SecurityEventListResult;
  currentSearch?: string;
  currentClientId?: string;
  currentAssetId?: string;
  currentSeverity?: string;
  currentStatus?: string;
  currentClassification?: string;
  currentSource?: string;
  currentAgentId?: string;
  currentRuleId?: string;
  currentDateFrom?: string;
  currentDateTo?: string;
  currentSort?: string;
}

function toDatetimeLocalValue(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function SecurityEventsFilters({
  data,
  currentSearch = "",
  currentClientId = "ALL",
  currentAssetId = "ALL",
  currentSeverity = "ALL",
  currentStatus = "ALL",
  currentClassification = "ALL",
  currentSource = "ALL",
  currentAgentId = "",
  currentRuleId = "",
  currentDateFrom,
  currentDateTo,
  currentSort = "newest",
}: SecurityEventsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value || value === "ALL") params.delete(key);
      else params.set(key, value);
      params.delete("page");
      router.push(`/security-events?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-2 lg:grid-cols-4">
      <input
        type="search"
        placeholder="Search events…"
        defaultValue={currentSearch}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            update("search", (e.target as HTMLInputElement).value);
          }
        }}
      />
      <select
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={currentSeverity}
        onChange={(e) => update("severity", e.target.value)}
      >
        <option value="ALL">All severities</option>
        {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={currentClassification}
        onChange={(e) => update("classification", e.target.value)}
      >
        <option value="ALL">All classifications</option>
        {["ACTIONABLE", "INFORMATIONAL", "NOISY", "IGNORED"].map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={currentStatus}
        onChange={(e) => update("status", e.target.value)}
      >
        <option value="ALL">All statuses</option>
        {["NEW", "REVIEWING", "ACKNOWLEDGED", "ESCALATED", "DISMISSED"].map(
          (s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          )
        )}
      </select>
      <select
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={currentClientId}
        onChange={(e) => update("clientId", e.target.value)}
      >
        <option value="ALL">All clients</option>
        {data.clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={currentAssetId}
        onChange={(e) => update("assetId", e.target.value)}
      >
        <option value="ALL">All assets</option>
        {data.assets
          .filter(
            (a) =>
              currentClientId === "ALL" || a.clientId === currentClientId
          )
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
      </select>
      <select
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={currentSource}
        onChange={(e) => update("source", e.target.value)}
      >
        <option value="ALL">All sources</option>
        <option value="WAZUH">WAZUH</option>
      </select>
      <select
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={currentSort}
        onChange={(e) => update("sort", e.target.value)}
      >
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      </select>
      <input
        type="text"
        placeholder="Wazuh rule ID"
        defaultValue={currentRuleId}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            update("ruleId", (e.target as HTMLInputElement).value);
          }
        }}
      />
      <input
        type="text"
        placeholder="Agent ID"
        defaultValue={currentAgentId}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            update("agentId", (e.target as HTMLInputElement).value);
          }
        }}
      />
      <input
        type="datetime-local"
        title="From"
        defaultValue={toDatetimeLocalValue(currentDateFrom)}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        onChange={(e) => {
          const iso = fromDatetimeLocal(e.target.value);
          update("dateFrom", iso ?? "");
        }}
      />
      <input
        type="datetime-local"
        title="To"
        defaultValue={toDatetimeLocalValue(currentDateTo)}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        onChange={(e) => {
          const iso = fromDatetimeLocal(e.target.value);
          update("dateTo", iso ?? "");
        }}
      />
      <Link
        href="/security-events"
        className="inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-sm text-muted hover:text-foreground"
      >
        Clear filters
      </Link>
    </div>
  );
}
