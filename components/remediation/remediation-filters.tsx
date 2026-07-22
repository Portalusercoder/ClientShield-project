"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface RemediationFiltersBarProps {
  users: { id: string; name: string | null; email: string }[];
  currentSearch?: string;
  currentStatus?: string;
  currentSeverity?: string;
  currentAssignedToUserId?: string;
  currentOverdueOnly?: boolean;
}

export function RemediationFiltersBar({
  users,
  currentSearch = "",
  currentStatus = "ALL",
  currentSeverity = "ALL",
  currentAssignedToUserId = "ALL",
  currentOverdueOnly = false,
}: RemediationFiltersBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentSearch);

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "ALL" && value !== "false") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`/remediation?${params.toString()}`);
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
        placeholder="Task or finding..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Select
        label="Status"
        value={currentStatus}
        options={[
          { value: "ALL", label: "All Statuses" },
          { value: "OPEN", label: "Open" },
          { value: "IN_PROGRESS", label: "In Progress" },
          { value: "BLOCKED", label: "Blocked" },
          { value: "COMPLETED", label: "Completed" },
          { value: "CANCELLED", label: "Cancelled" },
        ]}
        onChange={(e) => updateFilter("status", e.target.value)}
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
      <Select
        label="Overdue"
        value={currentOverdueOnly ? "true" : "false"}
        options={[
          { value: "false", label: "All Tasks" },
          { value: "true", label: "Overdue Only" },
        ]}
        onChange={(e) => updateFilter("overdueOnly", e.target.value)}
      />
    </div>
  );
}
