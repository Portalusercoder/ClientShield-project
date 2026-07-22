"use client";

import { useState } from "react";
import type {
  SecurityCheckDetail,
  SecurityCheckListItem,
  SecurityCheckSummary,
} from "@/types/security-check";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSecurityCheckDetailAction } from "@/app/(dashboard)/assets/security-check-actions";

interface SecurityChecksPanelProps {
  checks: SecurityCheckListItem[];
}

export function SecurityChecksPanel({ checks }: SecurityChecksPanelProps) {
  const [selected, setSelected] = useState<SecurityCheckDetail | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openCheck(id: string) {
    setLoadingId(id);
    setError(null);
    try {
      const detail = await getSecurityCheckDetailAction(id);
      setSelected(detail);
    } catch {
      setError("Unable to load check details");
    } finally {
      setLoadingId(null);
    }
  }

  if (checks.length === 0) {
    return (
      <EmptyState
        title="No security checks yet"
        description="Run a passive security check to inspect HTTPS, TLS, headers, and cookie configuration for this asset."
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
              <th className="px-4 py-3 font-medium text-muted">Status</th>
              <th className="px-4 py-3 font-medium text-muted">Score</th>
              <th className="hidden px-4 py-3 font-medium text-muted sm:table-cell">
                Duration
              </th>
              <th className="hidden px-4 py-3 font-medium text-muted md:table-cell">
                HTTPS
              </th>
              <th className="hidden px-4 py-3 font-medium text-muted lg:table-cell">
                TLS
              </th>
              <th className="hidden px-4 py-3 font-medium text-muted lg:table-cell">
                Headers
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {checks.map((check) => (
              <tr
                key={check.id}
                className="cursor-pointer bg-surface hover:bg-surface-elevated/50"
                onClick={() => openCheck(check.id)}
              >
                <td className="px-4 py-3 text-foreground">
                  {check.startedAt
                    ? formatDate(check.startedAt)
                    : formatDate(check.createdAt)}
                  <span className="ml-2 text-xs text-muted">
                    {formatRelativeTime(check.createdAt)}
                  </span>
                </td>
                <td className="px-4 py-3">{check.status}</td>
                <td className="px-4 py-3 tabular-nums">
                  {check.overallScore ?? "—"}
                </td>
                <td className="hidden px-4 py-3 tabular-nums text-muted sm:table-cell">
                  {check.durationMs != null
                    ? `${(check.durationMs / 1000).toFixed(1)}s`
                    : "—"}
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  {check.httpsReachable == null
                    ? "—"
                    : check.httpsReachable
                      ? "Reachable"
                      : "Failed"}
                </td>
                <td className="hidden px-4 py-3 lg:table-cell">
                  {check.tlsStatus ?? "—"}
                </td>
                <td className="hidden px-4 py-3 lg:table-cell">
                  {check.headersPresent != null
                    ? `${check.headersPresent} present / ${check.headersMissing ?? 0} missing`
                    : "—"}
                  {loadingId === check.id ? " …" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected?.summary && (
        <SecurityCheckDetailCards
          summary={selected.summary}
          score={selected.overallScore}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function SecurityCheckDetailCards({
  summary,
  score,
  onClose,
}: {
  summary: SecurityCheckSummary;
  score: number | null;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Check Details {score != null ? `· Score ${score}/100` : ""}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted hover:text-foreground"
        >
          Close
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>HTTPS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="Reachable" value={summary.https.reachable ? "Yes" : "No"} />
            <Row label="Status Code" value={summary.https.statusCode?.toString() ?? "—"} />
            <Row
              label="Response Time"
              value={
                summary.https.responseTimeMs != null
                  ? `${summary.https.responseTimeMs} ms`
                  : "—"
              }
            />
            <Row
              label="HTTP → HTTPS Redirect"
              value={
                summary.https.httpRedirectsToHttps == null
                  ? "—"
                  : summary.https.httpRedirectsToHttps
                    ? "Yes"
                    : "No"
              }
            />
            {summary.https.error && (
              <p className="text-xs text-danger">{summary.https.error}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>TLS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="Status" value={summary.tls.status} />
            <Row label="Issuer" value={summary.tls.issuer ?? "—"} />
            <Row
              label="Expiration"
              value={
                summary.tls.validTo
                  ? new Date(summary.tls.validTo).toLocaleDateString()
                  : "—"
              }
            />
            <Row
              label="Days Remaining"
              value={summary.tls.daysUntilExpiration?.toString() ?? "—"}
            />
            {summary.tls.error && (
              <p className="text-xs text-danger">{summary.tls.error}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security Headers</CardTitle>
            <CardDescription>
              Presence does not guarantee application security.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {summary.headers.items.map((item) => (
                <li key={item.name} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {item.name}
                    </span>
                    <span className="text-xs text-muted">{item.status}</span>
                  </div>
                  <p className="text-xs text-muted">{item.explanation}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cookies</CardTitle>
            <CardDescription>
              Cookie values are never stored or displayed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row
              label="Cookies Observed"
              value={summary.cookies.cookiesObserved.toString()}
            />
            <p className="text-xs text-muted">{summary.cookies.summary}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
