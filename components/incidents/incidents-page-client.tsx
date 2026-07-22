"use client";

import { useState } from "react";
import { CreateIncidentForm } from "@/components/incidents/create-incident-form";
import { IncidentsFiltersBar } from "@/components/incidents/incidents-filters";
import { IncidentsTable } from "@/components/incidents/incidents-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import type { IncidentListResult } from "@/types/incidents";

interface IncidentsPageClientProps {
  data: IncidentListResult;
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
  canCreate: boolean;
}

export function IncidentsPageClient({
  data,
  currentSearch,
  currentCaseNumber,
  currentClientId = "ALL",
  currentAssetId = "ALL",
  currentSeverity = "ALL",
  currentStatus = "ALL",
  currentCategory = "ALL",
  currentSource = "ALL",
  currentAssignedToUserId = "ALL",
  currentLeadAnalystUserId = "ALL",
  currentDetectedFrom,
  currentDetectedTo,
  canCreate,
}: IncidentsPageClientProps) {
  const [showCreate, setShowCreate] = useState(false);

  const cards = [
    {
      label: "Critical Open",
      value: data.summary.criticalOpen,
      tone: "text-severity-critical",
    },
    {
      label: "High Open",
      value: data.summary.highOpen,
      tone: "text-severity-high",
    },
    {
      label: "Investigating",
      value: data.summary.investigating,
      tone: "text-severity-medium",
    },
    {
      label: "Contained",
      value: data.summary.contained,
      tone: "text-severity-low",
    },
    {
      label: "Resolved This Month",
      value: data.summary.resolvedThisMonth,
      tone: "text-success",
    },
    {
      label: "Unassigned",
      value: data.summary.unassigned,
      tone: "text-muted",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Incident Management
          </h1>
          <p className="mt-1 text-sm text-muted">
            Track security incidents, coordinate response, and maintain an
            immutable investigation timeline.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Hide form" : "Create Incident"}
          </Button>
        )}
      </div>

      {showCreate && canCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Create Incident</CardTitle>
            <CardDescription>
              Manual incident intake. Scanner findings are not auto-escalated.
            </CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <CreateIncidentForm
              clients={data.clients}
              assets={data.assets}
              users={data.users}
              onClose={() => setShowCreate(false)}
            />
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className={`text-2xl tabular-nums ${card.tone}`}>
                {formatNumber(card.value)}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <IncidentsFiltersBar
        clients={data.clients}
        assets={data.assets}
        users={data.users}
        currentSearch={currentSearch}
        currentCaseNumber={currentCaseNumber}
        currentClientId={currentClientId}
        currentAssetId={currentAssetId}
        currentSeverity={currentSeverity}
        currentStatus={currentStatus}
        currentCategory={currentCategory}
        currentSource={currentSource}
        currentAssignedToUserId={currentAssignedToUserId}
        currentLeadAnalystUserId={currentLeadAnalystUserId}
        currentDetectedFrom={currentDetectedFrom}
        currentDetectedTo={currentDetectedTo}
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {data.total} incident{data.total !== 1 ? "s" : ""}
          {data.total > data.pageSize
            ? ` · page ${data.page}`
            : ""}
        </p>
      </div>

      <IncidentsTable incidents={data.incidents} />
    </div>
  );
}
