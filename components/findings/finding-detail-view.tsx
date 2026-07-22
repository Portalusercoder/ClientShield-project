"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addFindingNoteAction,
  createRemediationTaskAction,
  verifyFindingFixAction,
} from "@/app/(dashboard)/vulnerabilities/actions";
import {
  FindingSourceBadge,
  FindingStatusBadge,
} from "@/components/findings/finding-badges";
import { FindingTriagePanel } from "@/components/findings/finding-triage-panel";
import { EscalateFindingButton } from "@/components/incidents/escalate-finding-button";
import { SeverityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { formatEvidenceForDisplay } from "@/lib/findings/sanitize-evidence";
import type { FindingDetail, FindingInstanceItem } from "@/types/findings";

type Tab =
  | "overview"
  | "instances"
  | "evidence"
  | "triage"
  | "remediation"
  | "activity";

interface FindingDetailViewProps {
  finding: FindingDetail;
  users: { id: string; name: string | null; email: string }[];
  activity: {
    id: string;
    action: string;
    actorId: string | null;
    metadata: unknown;
    createdAt: Date;
  }[];
  instances: FindingInstanceItem[];
  instancesTotal: number;
  instancesPage: number;
  instancesPageSize: number;
  canManage: boolean;
  canVerify: boolean;
  canAcceptRisk: boolean;
}

export function FindingDetailView({
  finding,
  users,
  activity,
  instances,
  instancesTotal,
  instancesPage,
  instancesPageSize,
  canManage,
  canVerify,
  canAcceptRisk,
}: FindingDetailViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [assignee] = useState(finding.assignedToUserId ?? "");
  const [dueDate] = useState(
    finding.dueDate ? finding.dueDate.toISOString().slice(0, 10) : ""
  );
  const [note, setNote] = useState("");
  const [taskTitle, setTaskTitle] = useState(`Remediate: ${finding.title}`);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (result.success) {
        setMessage("Saved successfully.");
        router.refresh();
      } else {
        setError(result.error ?? "Action failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs text-muted">
            <Link href="/vulnerabilities" className="hover:text-accent">
              Findings
            </Link>
            {" / "}
            {finding.code ?? finding.id.slice(0, 8)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            {finding.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SeverityBadge severity={finding.severity} />
            <FindingStatusBadge status={finding.status} />
            <FindingSourceBadge source={finding.source} />
            {finding.triagePriority && (
              <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted">
                {finding.triagePriority}
              </span>
            )}
            <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted">
              Confidence: {finding.confidence ?? "Not provided"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <EscalateFindingButton
              findingId={finding.id}
              findingTitle={finding.title}
              suggestedSeverity={
                finding.severity === "CRITICAL"
                  ? "HIGH"
                  : finding.severity === "HIGH"
                    ? "MEDIUM"
                    : finding.severity
              }
            />
          )}
          {canVerify && finding.source === "PASSIVE_CHECK" && (
            <Button
              disabled={isPending}
              onClick={() =>
                runAction(async () => {
                  const result = await verifyFindingFixAction(finding.id);
                  if (result.success) {
                    setMessage(
                      result.data.resolved
                        ? "Verify Fix completed — finding resolved."
                        : "Verify Fix completed — issue still present."
                    );
                    router.refresh();
                    return { success: true };
                  }
                  return result;
                })
              }
            >
              {isPending ? "Verifying..." : "Verify Fix"}
            </Button>
          )}
        </div>
      </div>

      {(error || message) && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            error
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {error ?? message}
        </div>
      )}

      <nav className="flex gap-1 border-b border-border">
        {(
          [
            ["overview", "Overview"],
            [
              "instances",
              `Affected Instances (${finding.instanceCount || instancesTotal})`,
            ],
            ["evidence", "Evidence"],
            ["triage", "Triage"],
            ["remediation", "Remediation"],
            ["activity", "Activity"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? "border-b-2 border-accent text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <CardDescription>
                {finding.description ?? "No description provided."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Info label="Client" value={finding.clientName} />
                <Info
                  label="Asset"
                  value={finding.assetName}
                  href={`/assets/${finding.assetId}`}
                />
                <Info
                  label="First Detected"
                  value={formatDate(finding.firstDetectedAt)}
                />
                <Info
                  label="Last Detected"
                  value={formatDate(finding.lastDetectedAt)}
                />
                <Info label="Severity" value={finding.severity} />
                <Info
                  label="Triage Priority"
                  value={
                    finding.triagePriority ??
                    `Suggested: ${finding.suggestedPriority}`
                  }
                />
                <Info
                  label="Scanner Confidence"
                  value={finding.confidence ?? "Not provided"}
                />
                <Info label="Assigned Analyst" value={finding.assignedToName} />
                <Info
                  label="Affected Instances"
                  value={String(finding.instanceCount || instancesTotal || 0)}
                />
                {finding.source === "OWASP_ZAP" && (
                  <>
                    <Info label="Plugin ID" value={finding.pluginId} />
                    <Info label="CWE" value={finding.cweId} />
                    <Info label="WASC" value={finding.wascId} />
                    <Info label="ZAP Risk" value={finding.risk} />
                  </>
                )}
              </dl>
              <p className="mt-4 rounded-md border border-border bg-surface-elevated px-3 py-2 text-xs text-muted">
                Scanner findings require analyst validation and may include
                false positives. Severity is distinct from scanner confidence
                and triage priority.
              </p>
            </CardContent>
          </Card>

          {finding.status === "ACCEPTED_RISK" && (
            <Card>
              <CardHeader>
                <CardTitle>Accepted Risk</CardTitle>
                <CardDescription>
                  Known risk — not treated as technically fixed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4">
                  <Info label="Reason" value={finding.statusReason} />
                  <Info
                    label="Approved By"
                    value={finding.acceptedRiskApprovedByName}
                  />
                  <Info
                    label="Review / Expiration"
                    value={
                      finding.acceptedRiskReviewDate
                        ? formatDate(finding.acceptedRiskReviewDate)
                        : null
                    }
                  />
                </dl>
                {finding.riskAcceptanceReviewDue && (
                  <p className="mt-3 text-sm text-warning">
                    Risk Acceptance Review Due
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "triage" && (
        <FindingTriagePanel
          finding={finding}
          users={users}
          canManage={canManage}
          canAcceptRisk={canAcceptRisk}
        />
      )}

      {tab === "instances" && (
        <Card>
          <CardHeader>
            <CardTitle>Affected Instances</CardTitle>
            <CardDescription>
              Locations where this issue was observed. Showing page{" "}
              {instancesPage} ({instances.length} of {instancesTotal}).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {instancesTotal === 0 ? (
              <p className="text-sm text-muted">
                No affected instances recorded. Run the ZAP finding backfill
                (after dry-run review) or a new baseline scan to populate
                locations.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-elevated">
                      <th className="px-4 py-3 font-medium text-muted">
                        Path
                      </th>
                      <th className="px-4 py-3 font-medium text-muted">
                        Method
                      </th>
                      <th className="px-4 py-3 font-medium text-muted">
                        Parameter
                      </th>
                      <th className="px-4 py-3 font-medium text-muted">
                        First Detected
                      </th>
                      <th className="px-4 py-3 font-medium text-muted">
                        Last Detected
                      </th>
                      <th className="px-4 py-3 font-medium text-muted">Scan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {instances.map((inst) => (
                      <tr key={inst.id} className="bg-surface">
                        <td className="px-4 py-3 font-mono text-xs text-foreground">
                          {inst.normalizedPath}
                          {inst.url && (
                            <p className="mt-0.5 text-[11px] text-muted">
                              {inst.url}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {inst.httpMethod ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {inst.parameter ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {formatDate(inst.firstDetectedAt)}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {formatDate(inst.lastDetectedAt)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted">
                          {inst.scanId
                            ? `${inst.scanId.slice(0, 8)}…`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {instancesTotal > instancesPageSize && (
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="secondary"
                  disabled={instancesPage <= 1}
                  onClick={() => {
                    const params = new URLSearchParams(
                      window.location.search
                    );
                    params.set(
                      "instancesPage",
                      String(Math.max(1, instancesPage - 1))
                    );
                    router.push(
                      `/vulnerabilities/${finding.id}?${params.toString()}`
                    );
                  }}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={
                    instancesPage * instancesPageSize >= instancesTotal
                  }
                  onClick={() => {
                    const params = new URLSearchParams(
                      window.location.search
                    );
                    params.set("instancesPage", String(instancesPage + 1));
                    router.push(
                      `/vulnerabilities/${finding.id}?${params.toString()}`
                    );
                  }}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "evidence" && (
        <Card>
          <CardHeader>
            <CardTitle>Evidence</CardTitle>
            <CardDescription>
              Sanitized technical evidence. Secrets, tokens, passwords, and
              cookie values are never displayed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border bg-surface-elevated p-4 text-xs text-foreground">
              {formatEvidenceForDisplay(finding.evidence)}
            </pre>
          </CardContent>
        </Card>
      )}

      {tab === "remediation" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Remediation Guidance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-foreground">
                {finding.remediationGuidance ??
                  "No remediation guidance recorded for this finding."}
              </p>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  Add Remediation Note
                </label>
                <textarea
                  className="min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Document progress or residual risk notes..."
                />
              </div>
              <Button
                disabled={isPending || !note.trim()}
                onClick={() =>
                  runAction(async () => {
                    const fd = new FormData();
                    fd.set("note", note);
                    const result = await addFindingNoteAction(finding.id, fd);
                    if (result.success) setNote("");
                    return result;
                  })
                }
              >
                Add Note
              </Button>
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Create Remediation Task</CardTitle>
                <CardDescription>
                  Track ownership and due dates for this finding.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  label="Task Title"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                />
                <Button
                  disabled={isPending || !taskTitle.trim()}
                  onClick={() =>
                    runAction(async () => {
                      const fd = new FormData();
                      fd.set("findingId", finding.id);
                      fd.set("title", taskTitle);
                      fd.set(
                        "priority",
                        finding.severity === "CRITICAL" ||
                          finding.severity === "HIGH"
                          ? "HIGH"
                          : "MEDIUM"
                      );
                      if (assignee) fd.set("assignedToUserId", assignee);
                      if (dueDate) fd.set("dueDate", dueDate);
                      if (finding.status === "OPEN") {
                        const ok = window.confirm(
                          "This finding has not yet been validated. Create remediation task anyway?"
                        );
                        if (!ok) {
                          return {
                            success: false,
                            error: "Remediation creation cancelled",
                          };
                        }
                        fd.set("confirmUnvalidated", "true");
                      }
                      const result = await createRemediationTaskAction(fd);
                      if (result.success) {
                        router.push("/remediation");
                      }
                      return result;
                    })
                  }
                >
                  Create Task
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "activity" && (
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Audit history for this finding</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-muted">No activity recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {activity.map((entry) => (
                  <li key={entry.id} className="border-b border-border pb-3 last:border-0">
                    <p className="text-sm font-medium text-foreground">
                      {entry.action.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-muted">
                      {formatRelativeTime(entry.createdAt)} ·{" "}
                      {formatDate(entry.createdAt)}
                    </p>
                    {(() => {
                      const meta = entry.metadata as { note?: string } | null;
                      if (!meta?.note) return null;
                      return (
                        <p className="mt-1 text-sm text-muted">{meta.note}</p>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Info({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">
        {value ? (
          href ? (
            <Link href={href} className="text-accent hover:underline">
              {value}
            </Link>
          ) : (
            value
          )
        ) : (
          <span className="text-muted">—</span>
        )}
      </dd>
    </div>
  );
}
