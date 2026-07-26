"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  FRAMEWORK_REPORT_LABELS,
  type FrameworkReportDocument,
  type FrameworkReportKind,
  type ReportFilters,
} from "@/types/reporting-framework";

interface SessionHistoryItem {
  id: string;
  kind: FrameworkReportKind;
  title: string;
  generatedAt: string;
  summary: string;
}

interface ReportExportGeneratorProps {
  clients: { id: string; name: string }[];
  canExport: boolean;
}

const KIND_OPTIONS = (
  Object.entries(FRAMEWORK_REPORT_LABELS) as Array<
    [FrameworkReportKind, string]
  >
).map(([value, label]) => ({ value, label }));

function emptyFilters(): ReportFilters {
  return {
    dateFrom: "",
    dateTo: "",
    clientId: "",
    assetId: "",
    severity: "",
    status: "",
    ownerUserId: "",
    findingStatus: "",
    incidentId: "",
    investigationId: "",
  };
}

function sanitizeFilters(filters: ReportFilters): ReportFilters {
  const out: ReportFilters = {};
  for (const [key, value] of Object.entries(filters) as Array<
    [keyof ReportFilters, string | null | undefined]
  >) {
    if (value && String(value).trim()) {
      out[key] = String(value).trim();
    }
  }
  return out;
}

async function downloadBlob(url: string, body: unknown, fallbackName: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  const match = cd?.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

export function ReportExportGenerator({
  clients,
  canExport,
}: ReportExportGeneratorProps) {
  const [kind, setKind] = useState<FrameworkReportKind>("EXECUTIVE_SUMMARY");
  const [filters, setFilters] = useState<ReportFilters>(emptyFilters);
  const [preview, setPreview] = useState<FrameworkReportDocument | null>(null);
  const [history, setHistory] = useState<SessionHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "pdf" | "csv" | null>(null);

  const requestBody = useMemo(
    () => ({ kind, filters: sanitizeFilters(filters) }),
    [kind, filters]
  );

  function setFilter<K extends keyof ReportFilters>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function runPreview() {
    setError(null);
    setBusy("preview");
    try {
      const res = await fetch("/api/reporting/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Preview failed");
      }
      const doc = json.data as FrameworkReportDocument;
      setPreview(doc);
      setHistory((prev) =>
        [
          {
            id: `${doc.kind}-${doc.generatedAt}`,
            kind: doc.kind,
            title: doc.title,
            generatedAt: doc.generatedAt,
            summary: doc.summary,
          },
          ...prev,
        ].slice(0, 12)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function runPdf() {
    setError(null);
    setBusy("pdf");
    try {
      await downloadBlob(
        "/api/reporting/pdf",
        requestBody,
        `clientshield-${kind.toLowerCase()}.pdf`
      );
      setHistory((prev) =>
        [
          {
            id: `${kind}-pdf-${Date.now()}`,
            kind,
            title: `${FRAMEWORK_REPORT_LABELS[kind]} (PDF)`,
            generatedAt: new Date().toISOString(),
            summary: "Downloaded PDF export",
          },
          ...prev,
        ].slice(0, 12)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setBusy(null);
    }
  }

  async function runCsv() {
    setError(null);
    setBusy("csv");
    try {
      await downloadBlob(
        "/api/reporting/csv",
        requestBody,
        `clientshield-${kind.toLowerCase()}.csv`
      );
      setHistory((prev) =>
        [
          {
            id: `${kind}-csv-${Date.now()}`,
            kind,
            title: `${FRAMEWORK_REPORT_LABELS[kind]} (CSV)`,
            generatedAt: new Date().toISOString(),
            summary: "Downloaded CSV export",
          },
          ...prev,
        ].slice(0, 12)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV export failed");
    } finally {
      setBusy(null);
    }
  }

  if (!canExport) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>On-demand report generator</CardTitle>
          <CardDescription>
            Generate live PDF/CSV exports from current ClientShield data.
            History is kept for this browser session only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Select
              label="Report type"
              value={kind}
              options={KIND_OPTIONS}
              onChange={(e) => setKind(e.target.value as FrameworkReportKind)}
            />
            <Select
              label="Client"
              value={filters.clientId || "ALL"}
              options={[
                { value: "ALL", label: "All clients" },
                ...clients.map((c) => ({ value: c.id, label: c.name })),
              ]}
              onChange={(e) =>
                setFilter(
                  "clientId",
                  e.target.value === "ALL" ? "" : e.target.value
                )
              }
            />
            <Select
              label="Severity"
              value={filters.severity || "ALL"}
              options={[
                { value: "ALL", label: "Any" },
                { value: "CRITICAL", label: "Critical" },
                { value: "HIGH", label: "High" },
                { value: "MEDIUM", label: "Medium" },
                { value: "LOW", label: "Low" },
              ]}
              onChange={(e) =>
                setFilter(
                  "severity",
                  e.target.value === "ALL" ? "" : e.target.value
                )
              }
            />
            <Input
              label="Status"
              value={filters.status ?? ""}
              placeholder="e.g. OPEN, INVESTIGATING"
              onChange={(e) => setFilter("status", e.target.value)}
            />
            <Input
              label="Finding status"
              value={filters.findingStatus ?? ""}
              placeholder="e.g. OPEN, VALIDATED"
              onChange={(e) => setFilter("findingStatus", e.target.value)}
            />
            <Input
              label="Owner user ID"
              value={filters.ownerUserId ?? ""}
              placeholder="Incident / investigation / finding owner"
              onChange={(e) => setFilter("ownerUserId", e.target.value)}
            />
            <Input
              label="Date from"
              type="date"
              value={filters.dateFrom ?? ""}
              onChange={(e) => setFilter("dateFrom", e.target.value)}
            />
            <Input
              label="Date to"
              type="date"
              value={filters.dateTo ?? ""}
              onChange={(e) => setFilter("dateTo", e.target.value)}
            />
            <Input
              label="Asset ID"
              value={filters.assetId ?? ""}
              onChange={(e) => setFilter("assetId", e.target.value)}
            />
            <Input
              label="Incident ID"
              value={filters.incidentId ?? ""}
              onChange={(e) => setFilter("incidentId", e.target.value)}
            />
            <Input
              label="Investigation ID"
              value={filters.investigationId ?? ""}
              onChange={(e) => setFilter("investigationId", e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy !== null}
              onClick={() => void runPreview()}
            >
              {busy === "preview" ? "Previewing…" : "Preview"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void runPdf()}
            >
              {busy === "pdf" ? "Generating PDF…" : "Download PDF"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void runCsv()}
            >
              {busy === "csv" ? "Generating CSV…" : "Download CSV"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>{preview.title}</CardTitle>
            <CardDescription>
              {preview.organizationName} · Generated{" "}
              {new Date(preview.generatedAt).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-foreground">{preview.summary}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {preview.sections.map((section) => (
                <div
                  key={section.id}
                  className="rounded-lg border border-border bg-surface-elevated p-3"
                >
                  <p className="text-sm font-medium text-foreground">
                    {section.title}
                  </p>
                  {section.summary && (
                    <p className="mt-1 text-xs text-muted">{section.summary}</p>
                  )}
                  {section.kpis && section.kpis.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      {section.kpis.slice(0, 4).map((kpi) => (
                        <li key={kpi.label}>
                          <span className="text-foreground">{kpi.value}</span>{" "}
                          {kpi.label}
                        </li>
                      ))}
                    </ul>
                  )}
                  {section.tables?.[0] && (
                    <p className="mt-2 text-xs text-muted">
                      {section.tables[0].rows.length} row(s) in “
                      {section.tables[0].title}”
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent exports (this session)</CardTitle>
            <CardDescription>
              Not persisted — clears when you leave or refresh.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {history.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {item.title}
                    </p>
                    <p className="text-xs text-muted">{item.summary}</p>
                  </div>
                  <p className="text-xs text-muted">
                    {new Date(item.generatedAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
