"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

interface IncidentsFiltersBarProps {
  clients: { id: string; name: string }[];
  assets: { id: string; name: string; clientId: string }[];
  users: { id: string; name: string | null; email: string }[];
  currentSearch?: string;
  currentCaseNumber?: string;
  currentClientId?: string;
  currentAssetId?: string;
  currentSeverity?: string;
  currentStatus?: string;
  currentCategory?: string;
  currentSource?: string;
  currentAssignedToUserId?: string;
  currentLeadAnalystUserId?: string;
  currentDetectedFrom?: string;
  currentDetectedTo?: string;
}

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const STATUSES = [
  "OPEN",
  "ACKNOWLEDGED",
  "INVESTIGATING",
  "CONTAINED",
  "ERADICATED",
  "RECOVERING",
  "RESOLVED",
  "CLOSED",
];
const CATEGORIES = [
  "MALWARE",
  "PHISHING",
  "ACCOUNT_COMPROMISE",
  "UNAUTHORIZED_ACCESS",
  "BRUTE_FORCE",
  "DATA_EXPOSURE",
  "DATA_EXFILTRATION",
  "WEB_ATTACK",
  "DENIAL_OF_SERVICE",
  "VULNERABILITY_EXPLOITATION",
  "SUSPICIOUS_ACTIVITY",
  "POLICY_VIOLATION",
  "IOT_SECURITY",
  "OTHER",
];
const SOURCES = [
  "MANUAL",
  "FINDING",
  "WAZUH",
  "OWASP_ZAP",
  "PASSIVE_CHECK",
  "OTHER",
];

export function IncidentsFiltersBar({
  clients,
  assets,
  users,
  currentSearch = "",
  currentCaseNumber = "",
  currentClientId = "ALL",
  currentAssetId = "ALL",
  currentSeverity = "ALL",
  currentStatus = "ALL",
  currentCategory = "ALL",
  currentSource = "ALL",
  currentAssignedToUserId = "ALL",
  currentLeadAnalystUserId = "ALL",
  currentDetectedFrom = "",
  currentDetectedTo = "",
}: IncidentsFiltersBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const filteredAssets =
    currentClientId !== "ALL"
      ? assets.filter((a) => a.clientId === currentClientId)
      : assets;

  function apply(form: HTMLFormElement) {
    const fd = new FormData(form);
    const params = new URLSearchParams();
    for (const [key, value] of fd.entries()) {
      const v = String(value);
      if (v && v !== "ALL") params.set(key, v);
    }
    startTransition(() => {
      router.push(`/incidents?${params.toString()}`);
    });
  }

  return (
    <form
      className="grid gap-3 rounded-md border border-border bg-surface/40 p-4 md:grid-cols-2 xl:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
    >
      <input
        name="search"
        defaultValue={currentSearch}
        placeholder="Search title or case number (INC-…)…"
        className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground md:col-span-2"
      />
      <input
        name="caseNumber"
        defaultValue={currentCaseNumber}
        placeholder="Case number (e.g. INC-2026-…)"
        className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
      />
      <select
        name="leadAnalystUserId"
        defaultValue={currentLeadAnalystUserId}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="ALL">All lead analysts</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name ?? u.email}
          </option>
        ))}
      </select>
      <select
        name="clientId"
        defaultValue={currentClientId}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="ALL">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        name="assetId"
        defaultValue={currentAssetId}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="ALL">All assets</option>
        {filteredAssets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <select
        name="severity"
        defaultValue={currentSeverity}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="ALL">All severities</option>
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        name="status"
        defaultValue={currentStatus}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="ALL">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <select
        name="category"
        defaultValue={currentCategory}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="ALL">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <select
        name="source"
        defaultValue={currentSource}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="ALL">All sources</option>
        {SOURCES.map((s) => (
          <option key={s} value={s}>
            {s.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <select
        name="assignedToUserId"
        defaultValue={currentAssignedToUserId}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="ALL">All assignees</option>
        <option value="UNASSIGNED">Unassigned</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name ?? u.email}
          </option>
        ))}
      </select>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Detected from
        <input
          type="date"
          name="detectedFrom"
          defaultValue={currentDetectedFrom}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Detected to
        <input
          type="date"
          name="detectedTo"
          defaultValue={currentDetectedTo}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>
      <div className="flex items-center gap-2 md:col-span-2 xl:col-span-4">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {isPending ? "Filtering…" : "Apply filters"}
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:text-foreground"
          onClick={() => startTransition(() => router.push("/incidents"))}
        >
          Reset
        </button>
      </div>
    </form>
  );
}
