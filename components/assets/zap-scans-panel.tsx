"use client";

import { useState } from "react";
import { getZapBaselineScanDetailAction } from "@/app/(dashboard)/assets/zap-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import type { ZapScanDetail, ZapScanListItem } from "@/types/zap";

interface ZapScansPanelProps {
  scans: ZapScanListItem[];
}

export function ZapScansPanel({ scans }: ZapScansPanelProps) {
  const [selected, setSelected] = useState<ZapScanDetail | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openScan(id: string) {
    setLoadingId(id);
    setError(null);
    try {
      const detail = await getZapBaselineScanDetailAction(id);
      setSelected(detail);
    } catch {
      setError("Unable to load ZAP scan details");
    } finally {
      setLoadingId(null);
    }
  }

  if (scans.length === 0) {
    return (
      <EmptyState
        title="No ZAP baseline scans yet"
        description="Run a ZAP Baseline Scan to crawl this authorized website and import passive alerts into Findings."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              <th className="px-4 py-3 font-medium text-muted">Date</th>
              <th className="px-4 py-3 font-medium text-muted">Type</th>
              <th className="px-4 py-3 font-medium text-muted">Status</th>
              <th className="hidden px-4 py-3 font-medium text-muted sm:table-cell">
                Duration
              </th>
              <th className="px-4 py-3 font-medium text-muted">High</th>
              <th className="px-4 py-3 font-medium text-muted">Medium</th>
              <th className="hidden px-4 py-3 font-medium text-muted md:table-cell">
                Low
              </th>
              <th className="hidden px-4 py-3 font-medium text-muted lg:table-cell">
                Info
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {scans.map((scan) => (
              <tr
                key={scan.id}
                className="cursor-pointer bg-surface hover:bg-surface-elevated/50"
                onClick={() => openScan(scan.id)}
              >
                <td className="px-4 py-3 text-foreground">
                  {scan.startedAt
                    ? formatDate(scan.startedAt)
                    : formatDate(scan.createdAt)}
                  <span className="ml-2 text-xs text-muted">
                    {formatRelativeTime(scan.createdAt)}
                  </span>
                  {loadingId === scan.id ? " …" : ""}
                </td>
                <td className="px-4 py-3 text-muted">ZAP Baseline</td>
                <td className="px-4 py-3">{scan.status}</td>
                <td className="hidden px-4 py-3 tabular-nums text-muted sm:table-cell">
                  {scan.durationMs != null
                    ? `${(scan.durationMs / 1000).toFixed(1)}s`
                    : "—"}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {scan.alertCounts?.high ?? "—"}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {scan.alertCounts?.medium ?? "—"}
                </td>
                <td className="hidden px-4 py-3 tabular-nums md:table-cell">
                  {scan.alertCounts?.low ?? "—"}
                </td>
                <td className="hidden px-4 py-3 tabular-nums lg:table-cell">
                  {scan.alertCounts?.informational ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
            <CardHeader>
              <CardTitle>ZAP Baseline Scan Details</CardTitle>
              <CardDescription>
                Sanitized summary only — raw scanner traffic is never shown.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Detail label="Scanner" value="OWASP ZAP" />
                <Detail
                  label="Scanner version"
                  value={selected.scannerVersion}
                />
                <Detail label="Target asset" value={selected.assetName} />
                <Detail label="Status" value={selected.status} />
                <Detail
                  label="Started"
                  value={
                    selected.startedAt
                      ? formatDate(selected.startedAt)
                      : null
                  }
                />
                <Detail
                  label="Completed"
                  value={
                    selected.completedAt
                      ? formatDate(selected.completedAt)
                      : null
                  }
                />
                <Detail
                  label="Duration"
                  value={
                    selected.durationMs != null
                      ? `${(selected.durationMs / 1000).toFixed(1)}s`
                      : null
                  }
                />
                <Detail
                  label="Mode"
                  value={selected.summary?.scanMode ?? "BASELINE_PASSIVE"}
                />
              </dl>

              <div>
                <h3 className="text-sm font-medium text-foreground">
                  Alert summary
                </h3>
                <ul className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <li>High: {selected.alertCounts?.high ?? 0}</li>
                  <li>Medium: {selected.alertCounts?.medium ?? 0}</li>
                  <li>Low: {selected.alertCounts?.low ?? 0}</li>
                  <li>Info: {selected.alertCounts?.informational ?? 0}</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-medium text-foreground">
                  Findings import
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Created: {selected.findingsCreated} · Updated:{" "}
                  {selected.findingsUpdated}
                  {selected.summary?.findingsReopened
                    ? ` · Reopened: ${selected.summary.findingsReopened}`
                    : ""}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Resolution policy: ZAP findings are not auto-resolved when
                  absent from a later baseline scan.
                </p>
              </div>

              {selected.summary?.warnings &&
                selected.summary.warnings.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-foreground">
                      Warnings
                    </h3>
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                      {selected.summary.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

              {selected.errorMessage && (
                <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {selected.errorMessage}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-elevated"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value ?? "—"}</dd>
    </div>
  );
}
