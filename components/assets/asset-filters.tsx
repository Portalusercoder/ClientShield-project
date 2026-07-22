"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TYPE_LABELS } from "@/components/assets/asset-badges";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AssetClientOption } from "@/types/asset";

interface AssetFiltersProps {
  clients: AssetClientOption[];
  currentSearch?: string;
  currentClientId?: string;
  currentType?: string;
  currentCriticality?: string;
  currentMonitoringStatus?: string;
}

export function AssetFiltersBar({
  clients,
  currentSearch = "",
  currentClientId = "ALL",
  currentType = "ALL",
  currentCriticality = "ALL",
  currentMonitoringStatus = "ALL",
}: AssetFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentSearch);

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "ALL") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`/assets?${params.toString()}`);
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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Input
        label="Search"
        name="search"
        placeholder="Search name, URL, hostname..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Select
        label="Client"
        name="clientId"
        value={currentClientId}
        options={[
          { value: "ALL", label: "All Clients" },
          ...clients.map((c) => ({ value: c.id, label: c.name })),
        ]}
        onChange={(e) => updateFilter("clientId", e.target.value)}
      />
      <Select
        label="Asset Type"
        name="type"
        value={currentType}
        options={[
          { value: "ALL", label: "All Types" },
          ...Object.entries(TYPE_LABELS).map(([value, label]) => ({
            value,
            label,
          })),
        ]}
        onChange={(e) => updateFilter("type", e.target.value)}
      />
      <Select
        label="Criticality"
        name="criticality"
        value={currentCriticality}
        options={[
          { value: "ALL", label: "All Levels" },
          { value: "CRITICAL", label: "Critical" },
          { value: "HIGH", label: "High" },
          { value: "MEDIUM", label: "Medium" },
          { value: "LOW", label: "Low" },
        ]}
        onChange={(e) => updateFilter("criticality", e.target.value)}
      />
      <Select
        label="Monitoring"
        name="monitoringStatus"
        value={currentMonitoringStatus}
        options={[
          { value: "ALL", label: "All Statuses" },
          { value: "ACTIVE", label: "Active" },
          { value: "PAUSED", label: "Paused" },
          { value: "INACTIVE", label: "Inactive" },
        ]}
        onChange={(e) => updateFilter("monitoringStatus", e.target.value)}
      />
    </div>
  );
}
