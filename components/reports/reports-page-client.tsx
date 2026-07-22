"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  archiveReportAction,
  generateReportAction,
} from "@/app/(dashboard)/reports/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import type { ReportListItem } from "@/services/reports/report.service";
import type { ReportStatus, ReportType } from "@prisma/client";

interface ReportsPageClientProps {
  reports: ReportListItem[];
  total: number;
  clients: { id: string; name: string }[];
  canGenerate: boolean;
  canArchive: boolean;
  currentClientId: string;
  currentType: string;
  currentStatus: string;
}

export function ReportsPageClient({
  reports,
  total,
  clients,
  canGenerate,
  canArchive,
  currentClientId,
  currentType,
  currentStatus,
}: ReportsPageClientProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const defaultEnd = new Date().toISOString().slice(0, 10);
  const defaultStart = new Date(Date.now() - 90 * 86400000)
    .toISOString()
    .slice(0, 10);

  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [title, setTitle] = useState("Security Posture Report");
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== "ALL") params.set(key, value);
    else params.delete(key);
    router.push(`/reports?${params.toString()}`);
  }

  function generate() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("clientId", clientId);
      fd.set("reportType", "SECURITY_POSTURE");
      fd.set("title", title);
      fd.set("reportingPeriodStart", periodStart);
      fd.set("reportingPeriodEnd", periodEnd);
      const result = await generateReportAction(fd);
      if (result.success) {
        setModalOpen(false);
        router.push(`/reports/${result.data.id}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Security Reports
          </h1>
          <p className="mt-1 text-sm text-muted">
            Generate immutable, client-facing security posture reports from
            assessed findings and analyst triage. Reports are snapshots — they
            do not change when live data updates.
          </p>
        </div>
        {canGenerate && (
          <Button onClick={() => setModalOpen(true)}>Generate Report</Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
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
          label="Report Type"
          value={currentType}
          options={[
            { value: "ALL", label: "All Types" },
            { value: "SECURITY_POSTURE", label: "Security Posture" },
            { value: "EXECUTIVE_SUMMARY", label: "Executive Summary" },
            { value: "TECHNICAL_FINDINGS", label: "Technical Findings" },
            { value: "REMEDIATION_STATUS", label: "Remediation Status" },
          ]}
          onChange={(e) => updateFilter("reportType", e.target.value)}
        />
        <Select
          label="Status"
          value={currentStatus}
          options={[
            { value: "ALL", label: "All Statuses" },
            { value: "READY", label: "Ready" },
            { value: "GENERATING", label: "Generating" },
            { value: "FAILED", label: "Failed" },
            { value: "ARCHIVED", label: "Archived" },
          ]}
          onChange={(e) => updateFilter("status", e.target.value)}
        />
      </div>

      {reports.length === 0 ? (
        <EmptyState
          title="No reports yet"
          description="Generate a Security Posture Report for a client to create an immutable snapshot suitable for management and IT stakeholders."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-elevated">
                <th className="px-4 py-3 font-medium text-muted">Title</th>
                <th className="px-4 py-3 font-medium text-muted">Client</th>
                <th className="px-4 py-3 font-medium text-muted">Type</th>
                <th className="px-4 py-3 font-medium text-muted">Period</th>
                <th className="px-4 py-3 font-medium text-muted">Status</th>
                <th className="px-4 py-3 font-medium text-muted">Version</th>
                <th className="px-4 py-3 font-medium text-muted">Generated</th>
                <th className="px-4 py-3 font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reports.map((r) => (
                <tr key={r.id} className="bg-surface">
                  <td className="px-4 py-3">
                    <Link
                      href={`/reports/${r.id}`}
                      className="font-medium text-foreground hover:text-accent"
                    >
                      {r.title}
                    </Link>
                    <p className="text-xs text-muted">
                      {r.createdByName ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted">{r.clientName}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {formatType(r.reportType)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {formatDate(r.reportingPeriodStart)} –{" "}
                    {formatDate(r.reportingPeriodEnd)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted">
                    v{r.version}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {r.generatedAt ? formatDate(r.generatedAt) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/reports/${r.id}`}
                        className="text-xs text-accent hover:underline"
                      >
                        View
                      </Link>
                      {(r.status === "READY" || r.status === "ARCHIVED") && (
                        <a
                          href={`/reports/${r.id}/download`}
                          className="text-xs text-accent hover:underline"
                        >
                          PDF
                        </a>
                      )}
                      {canArchive && r.status === "READY" && (
                        <button
                          type="button"
                          className="text-xs text-muted hover:text-danger"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              await archiveReportAction(r.id);
                              router.refresh();
                            })
                          }
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted">{total} report(s)</p>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Generate Security Posture Report</CardTitle>
              <CardDescription>
                Creates an immutable snapshot and PDF for the selected client.
                Default type: Security Posture.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {error && (
                <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}
              <Select
                label="Client"
                value={clientId}
                options={clients.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
                onChange={(e) => {
                  setClientId(e.target.value);
                  const name =
                    clients.find((c) => c.id === e.target.value)?.name ??
                    "Client";
                  setTitle(`Security Posture Report — ${name}`);
                }}
              />
              <Input
                label="Report Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Input
                label="Period Start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
              <Input
                label="Period End"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setModalOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={generate}
                  disabled={isPending || !clientId || !title.trim()}
                >
                  {isPending ? "Generating…" : "Generate"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function formatType(t: ReportType): string {
  return t.replace(/_/g, " ");
}

function StatusPill({ status }: { status: ReportStatus }) {
  const tone =
    status === "READY"
      ? "text-success"
      : status === "FAILED"
        ? "text-danger"
        : status === "ARCHIVED"
          ? "text-muted"
          : "text-warning";
  return <span className={`text-xs font-medium ${tone}`}>{status}</span>;
}
