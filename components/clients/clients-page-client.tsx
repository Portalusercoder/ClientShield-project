"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClientFilters } from "@/components/clients/client-filters";
import { ClientFormModal } from "@/components/clients/client-form-modal";
import { ClientTable } from "@/components/clients/client-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { ClientListResult } from "@/types/client";

interface ClientsPageClientProps {
  data: ClientListResult;
  currentSearch?: string;
  currentStatus?: string;
  currentOnboarding?: string;
  currentReadiness?: string;
  currentIndustry?: string;
  canCreate: boolean;
}

export function ClientsPageClient({
  data,
  currentSearch,
  currentStatus,
  currentOnboarding,
  currentReadiness,
  currentIndustry,
  canCreate,
}: ClientsPageClientProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  const hasFilters =
    Boolean(currentSearch) ||
    (currentStatus && currentStatus !== "ALL") ||
    (currentOnboarding && currentOnboarding !== "ALL") ||
    (currentReadiness && currentReadiness !== "ALL") ||
    (currentIndustry && currentIndustry !== "ALL");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            {data.total} client{data.total !== 1 ? "s" : ""} registered
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setAddOpen(true)}>Add Client</Button>
        )}
      </div>

      <ClientFilters
        industries={data.industries}
        currentSearch={currentSearch}
        currentStatus={currentStatus}
        currentOnboarding={currentOnboarding}
        currentReadiness={currentReadiness}
        currentIndustry={currentIndustry}
      />

      {data.clients.length === 0 ? (
        <EmptyState
          title="No clients found"
          description={
            hasFilters
              ? "No clients match your current filters. Try adjusting your search criteria."
              : "No clients have been added yet. Add your first client to begin onboarding and monitoring."
          }
          className="mt-4"
        >
          {canCreate && !hasFilters && (
            <Button className="mt-4" onClick={() => setAddOpen(true)}>
              Add Client
            </Button>
          )}
        </EmptyState>
      ) : (
        <ClientTable clients={data.clients} />
      )}

      {addOpen && (
        <ClientFormModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSuccess={(id) => {
            router.push(`/clients/${id}/onboarding`);
          }}
        />
      )}
    </div>
  );
}
