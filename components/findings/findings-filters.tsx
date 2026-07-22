"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface FindingsFiltersBarProps {
  clients: { id: string; name: string }[];
  assets: { id: string; name: string; clientId: string }[];
  users: { id: string; name: string | null; email: string }[];
  currentSearch?: string;
  currentClientId?: string;
  currentAssetId?: string;
  currentSeverity?: string;
  currentStatus?: string;
  currentSource?: string;
  currentPriority?: string;
  currentNeedsTriage?: boolean;
  currentAssignedToUserId?: string;
}

export function FindingsFiltersBar({
  clients,
  assets,
  users,
  currentSearch = "",
  currentClientId = "ALL",
  currentAssetId = "ALL",
  currentSeverity = "ALL",
  currentStatus = "ALL",
  currentSource = "ALL",
  currentPriority = "ALL",
  currentNeedsTriage = false,
  currentAssignedToUserId = "ALL",
}: FindingsFiltersBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentSearch);

  const filteredAssets =
    currentClientId !== "ALL"
      ? assets.filter((a) => a.clientId === currentClientId)
      : assets;

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "ALL" && value !== "false") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      if (key === "clientId") {
        params.delete("assetId");
      }
      if (key === "needsTriage" && value === "true") {
        params.delete("status");
      }
      params.delete("page");
      router.push(`/vulnerabilities?${params.toString()}`);
    },
    [router, searchParams]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== currentSearch) {
        updateFilter("search", search);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, currentSearch, updateFilter]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-9">
      <Input
        label="Search"
        placeholder="Title, code..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Select
        label="Needs Triage"
        value={currentNeedsTriage ? "true" : "ALL"}
        options={[
          { value: "ALL", label: "All" },
          { value: "true", label: "Needs Triage (Open)" },
        ]}
        onChange={(e) => updateFilter("needsTriage", e.target.value)}
      />
      <Select
        label="Client"
        value={currentClientId}
        options={[
          { value: "ALL", label: "All Clients" },
          ...clients.map((c) => ({ value: c.id, label: c.name })),
        ]}
        onChange={(e) => updateFilter("clientId", e.target.value)}
      />
      <Select
        label="Asset"
        value={currentAssetId}
        options={[
          { value: "ALL", label: "All Assets" },
          ...filteredAssets.map((a) => ({ value: a.id, label: a.name })),
        ]}
        onChange={(e) => updateFilter("assetId", e.target.value)}
      />
      <Select
        label="Severity"
        value={currentSeverity}
        options={[
          { value: "ALL", label: "All Severities" },
          { value: "CRITICAL", label: "Critical" },
          { value: "HIGH", label: "High" },
          { value: "MEDIUM", label: "Medium" },
          { value: "LOW", label: "Low" },
          { value: "INFO", label: "Info" },
        ]}
        onChange={(e) => updateFilter("severity", e.target.value)}
      />
      <Select
        label="Priority"
        value={currentPriority}
        options={[
          { value: "ALL", label: "All Priorities" },
          { value: "P1_CRITICAL", label: "P1" },
          { value: "P2_HIGH", label: "P2" },
          { value: "P3_MEDIUM", label: "P3" },
          { value: "P4_LOW", label: "P4" },
          { value: "P5_INFORMATIONAL", label: "P5" },
        ]}
        onChange={(e) => updateFilter("triagePriority", e.target.value)}
      />
      <Select
        label="Status"
        value={currentNeedsTriage ? "ALL" : currentStatus}
        options={[
          { value: "ALL", label: "All Statuses" },
          { value: "OPEN", label: "Open" },
          { value: "VALIDATED", label: "Validated" },
          { value: "IN_PROGRESS", label: "In Progress" },
          { value: "RESOLVED", label: "Resolved" },
          { value: "ACCEPTED_RISK", label: "Accepted Risk" },
          { value: "FALSE_POSITIVE", label: "False Positive" },
        ]}
        onChange={(e) => updateFilter("status", e.target.value)}
      />
      <Select
        label="Source"
        value={currentSource}
        options={[
          { value: "ALL", label: "All Sources" },
          { value: "PASSIVE_CHECK", label: "Passive Check" },
          { value: "OWASP_ZAP", label: "OWASP ZAP" },
          { value: "MANUAL", label: "Manual" },
          { value: "OTHER", label: "Other" },
        ]}
        onChange={(e) => updateFilter("source", e.target.value)}
      />
      <Select
        label="Assigned To"
        value={currentAssignedToUserId}
        options={[
          { value: "ALL", label: "Anyone" },
          ...users.map((u) => ({
            value: u.id,
            label: u.name ?? u.email,
          })),
        ]}
        onChange={(e) => updateFilter("assignedToUserId", e.target.value)}
      />
    </div>
  );
}
