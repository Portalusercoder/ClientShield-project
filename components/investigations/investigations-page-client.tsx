"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createInvestigationAction } from "@/app/(dashboard)/investigations/actions";
import { InvestigationsFilters } from "@/components/investigations/investigations-filters";
import { InvestigationsTable } from "@/components/investigations/investigations-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import type {
  InvestigationListItem,
  InvestigationMetrics,
} from "@/types/investigations";

interface InvestigationsPageClientProps {
  items: InvestigationListItem[];
  total: number;
  page: number;
  pageSize: number;
  metrics: InvestigationMetrics;
  currentStatus?: string;
  currentCreatedByType?: string;
  canCreate: boolean;
}

export function InvestigationsPageClient({
  items,
  total,
  page,
  pageSize,
  metrics,
  currentStatus = "ALL",
  currentCreatedByType = "ALL",
  canCreate,
}: InvestigationsPageClientProps) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const cards = [
    { label: "Open", value: metrics.open, tone: "text-severity-high" },
    {
      label: "Investigating",
      value: metrics.investigating,
      tone: "text-severity-medium",
    },
    {
      label: "System Suggested",
      value: metrics.systemSuggestedOpen,
      tone: "text-accent",
    },
    { label: "Confirmed", value: metrics.confirmed, tone: "text-accent" },
    {
      label: "Linked to Incident",
      value: metrics.linkedToIncident,
      tone: "text-success",
    },
    { label: "Total", value: metrics.total, tone: "text-foreground" },
  ];

  function onCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createInvestigationAction(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setShowCreate(false);
      router.push(`/investigations/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Investigations
          </h1>
          <p className="mt-1 text-sm text-muted">
            Group related security events, review correlation suggestions, and
            escalate to incidents when confirmed.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Hide form" : "Create Investigation"}
          </Button>
        )}
      </div>

      {showCreate && canCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Create Investigation</CardTitle>
            <CardDescription>
              Manually group one or more security events for analyst review.
            </CardDescription>
          </CardHeader>
          <form action={onCreate} className="space-y-4 px-6 pb-6">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">
                Title
              </label>
              <input
                name="title"
                required
                maxLength={300}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Investigation title"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">
                Security event IDs
              </label>
              <textarea
                name="securityEventIds"
                required
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                placeholder="Paste event IDs separated by commas or newlines"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">
                  Severity
                </label>
                <select
                  name="severity"
                  defaultValue="MEDIUM"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">
                  Summary (optional)
                </label>
                <input
                  name="summary"
                  maxLength={5000}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">
                Grouping explanation (optional)
              </label>
              <textarea
                name="groupingExplanation"
                rows={2}
                maxLength={5000}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            {error && (
              <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating…" : "Create"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
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

      <InvestigationsFilters
        currentStatus={currentStatus}
        currentCreatedByType={currentCreatedByType}
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {total} investigation{total !== 1 ? "s" : ""}
          {total > pageSize ? ` · page ${page}` : ""}
        </p>
      </div>

      <InvestigationsTable items={items} />
    </div>
  );
}
