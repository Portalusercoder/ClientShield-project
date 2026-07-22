"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "ONBOARDING", label: "Onboarding" },
  { value: "INACTIVE", label: "Inactive" },
];

interface ClientFiltersProps {
  industries: string[];
  currentSearch?: string;
  currentStatus?: string;
  currentIndustry?: string;
}

export function ClientFilters({
  industries,
  currentSearch = "",
  currentStatus = "ALL",
  currentIndustry = "ALL",
}: ClientFiltersProps) {
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
      router.push(`/clients?${params.toString()}`);
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

  const industryOptions = [
    { value: "ALL", label: "All Industries" },
    ...industries.map((i) => ({ value: i, label: i })),
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Input
          label="Search"
          name="search"
          placeholder="Search by client name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="w-full sm:w-44">
        <Select
          label="Status"
          name="status"
          value={currentStatus}
          options={STATUS_OPTIONS}
          onChange={(e) => updateFilter("status", e.target.value)}
        />
      </div>
      {industries.length > 0 && (
        <div className="w-full sm:w-44">
          <Select
            label="Industry"
            name="industry"
            value={currentIndustry}
            options={industryOptions}
            onChange={(e) => updateFilter("industry", e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
