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
import { PageHeader } from "@/components/ui/page-header";
import { SummaryStrip } from "@/components/ui/summary-strip";
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
      <PageHeader
        title="Investigations"
        description="Group related events, confirm correlations, then escalate to incidents when needed."
        actions={
          canCreate ? (
            <Button onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? "Hide form" : "Create Investigation"}
            </Button>
          ) : undefined
        }
      />

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

      <SummaryStrip metrics={cards} />

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
