"use client";

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
  currentIndustry?: string;
  canCreate: boolean;
}

export function ClientsPageClient({
  data,
  currentSearch,
  currentStatus,
  currentIndustry,
  canCreate,
}: ClientsPageClientProps) {
  const [addOpen, setAddOpen] = useState(false);

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
        currentIndustry={currentIndustry}
      />

      {data.clients.length === 0 ? (
        <EmptyState
          title="No clients found"
          description={
            currentSearch || currentStatus !== "ALL" || currentIndustry !== "ALL"
              ? "No clients match your current filters. Try adjusting your search criteria."
              : "No clients have been added yet. Add your first client to begin monitoring their security posture."
          }
          className="mt-4"
        >
          {canCreate && !currentSearch && currentStatus === "ALL" && (
            <Button className="mt-4" onClick={() => setAddOpen(true)}>
              Add Client
            </Button>
          )}
        </EmptyState>
      ) : (
        <ClientTable clients={data.clients} />
      )}

      {addOpen && (
        <ClientFormModal open={addOpen} onClose={() => setAddOpen(false)} />
      )}
    </div>
  );
}
