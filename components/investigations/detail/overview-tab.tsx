"use client";

import {
  acceptCandidateAction,
  assignInvestigationAction,
  closeInvestigationAction,
  dismissInvestigationAction,
  reopenInvestigationAction,
  rejectCandidateAction,
  resolveInvestigationAction,
} from "@/app/(dashboard)/investigations/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";
import type { InvestigationActivityRow } from "@/types/investigations";
import { Field, userLabel, type TabBaseProps } from "./shared";

interface OverviewTabProps extends TabBaseProps {
  canReopen: boolean;
  assignmentHistory: InvestigationActivityRow[];
}

export function OverviewTab({
  investigation,
  canAct,
  closed,
  canReopen,
  isPending,
  runAction,
  assignmentHistory,
}: OverviewTabProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" value={investigation.status.replaceAll("_", " ")} />
            <Field label="Severity" value={investigation.severity} />
            <Field
              label="Source"
              value={
                investigation.createdByType === "SYSTEM_SUGGESTED"
                  ? "System suggested"
                  : "Analyst created"
              }
            />
            <Field
              label="Updated"
              value={formatRelativeTime(investigation.updatedAt)}
            />
            <Field
              label="Created"
              value={formatDateTime(investigation.createdAt)}
            />
            <Field
              label="Confirmed"
              value={
                investigation.confirmedAt
                  ? formatDateTime(investigation.confirmedAt)
                  : "—"
              }
            />
          </dl>
          {investigation.summary && (
            <p className="mt-4 text-sm text-muted">{investigation.summary}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Why this was grouped</CardTitle>
          <CardDescription>
            Explainable correlation quality signals
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {investigation.qualityWarning ? (
            <p className="rounded-md border border-severity-high/30 bg-severity-medium/10 px-3 py-2 text-sm text-severity-medium">
              {investigation.qualityWarning}
            </p>
          ) : null}
          {investigation.strongSignals.length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">
                Strong signals
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {investigation.strongSignals.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {investigation.supportingSignals.length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">
                Context / supporting
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {investigation.supportingSignals.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-sm text-foreground">
            {investigation.groupingExplanation ??
              "No grouping explanation recorded."}
          </p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Confidence"
              value={investigation.confidence ?? "—"}
            />
            <Field
              label="Actionable events"
              value={investigation.qualityMetrics?.actionableEventCount ?? "—"}
            />
            <Field
              label="Noisy events"
              value={investigation.qualityMetrics?.noisyEventCount ?? "—"}
            />
            <Field
              label="Distinct rules"
              value={investigation.qualityMetrics?.distinctRuleCount ?? "—"}
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Counts</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Field label="Events" value={investigation.eventCount} />
            <Field
              label="Observables"
              value={investigation.observableCount}
            />
            <Field
              label="Linked incidents"
              value={investigation.incidentCount}
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assignment</CardTitle>
          <CardDescription>
            Formal assignee within the same organization (independent of
            Attention claim)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Current assignee"
                value={userLabel(investigation.assignedTo)}
              />
              <Field
                label="Assigned at"
                value={
                  investigation.assignedAt
                    ? formatDateTime(investigation.assignedAt)
                    : "—"
                }
              />
            </dl>
            <p className="text-xs text-muted">
              Assignment is formal ownership. Attention claim (if any) is a
              separate temporary work lock and is not changed by this form.
            </p>
          {canAct && !closed && (
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              action={(fd) => {
                fd.set("groupId", investigation.id);
                runAction(
                  () => assignInvestigationAction(fd),
                  "Assignment updated"
                );
              }}
            >
              <label className="flex-1 text-sm">
                <span className="mb-1 block text-xs uppercase tracking-wide text-muted">
                  Assign to
                </span>
                <select
                  name="assignedToUserId"
                  defaultValue={investigation.assignedToUserId ?? ""}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {investigation.orgUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {userLabel(u)}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" size="sm" disabled={isPending}>
                Save assignment
              </Button>
            </form>
          )}
          {assignmentHistory.length > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted">
                Assignment history
              </p>
              <ul className="space-y-2">
                {assignmentHistory.slice(0, 8).map((a) => (
                  <li
                    key={a.id}
                    className="rounded border border-border px-3 py-2 text-xs"
                  >
                    <div className="font-medium text-foreground">
                      {a.message}
                    </div>
                    <div className="mt-1 text-muted">
                      {formatDateTime(a.createdAt)}
                      {a.actorName || a.actorEmail
                        ? ` · ${a.actorName || a.actorEmail}`
                        : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Closure</CardTitle>
          <CardDescription>
            Resolve, close, or reopen with full history preserved
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Resolution summary"
              value={investigation.resolutionSummary || "—"}
            />
            <Field
              label="Closed at"
              value={
                investigation.closedAt
                  ? formatDateTime(investigation.closedAt)
                  : "—"
              }
            />
            <Field
              label="Closed by"
              value={userLabel(investigation.closedBy)}
            />
            <Field
              label="Last reopened"
              value={
                investigation.reopenedAt
                  ? formatDateTime(investigation.reopenedAt)
                  : "—"
              }
            />
          </dl>
          {investigation.lastReopenReason && (
            <p className="text-sm text-muted">
              Reopen reason: {investigation.lastReopenReason}
            </p>
          )}
          {canAct &&
            !closed &&
            investigation.status !== "RESOLVED" && (
              <form
                className="space-y-3"
                action={(fd) => {
                  fd.set("groupId", investigation.id);
                  runAction(
                    () => resolveInvestigationAction(fd),
                    "Investigation resolved"
                  );
                }}
              >
                <textarea
                  name="resolutionSummary"
                  rows={2}
                  placeholder="Optional resolution summary"
                  defaultValue={investigation.resolutionSummary ?? ""}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <Button type="submit" size="sm" disabled={isPending}>
                  Mark resolved
                </Button>
              </form>
            )}
          {canAct &&
            (investigation.status === "RESOLVED" ||
              investigation.status === "LINKED_TO_INCIDENT") && (
              <form
                className="space-y-3"
                action={(fd) => {
                  fd.set("groupId", investigation.id);
                  runAction(
                    () => closeInvestigationAction(fd),
                    "Investigation closed"
                  );
                }}
              >
                <textarea
                  name="resolutionSummary"
                  required
                  rows={3}
                  placeholder="Resolution summary (required to close)"
                  defaultValue={investigation.resolutionSummary ?? ""}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <Button type="submit" size="sm" disabled={isPending}>
                  Close investigation
                </Button>
              </form>
            )}
          {canAct && canReopen && (
            <form
              className="space-y-3"
              action={(fd) => {
                fd.set("groupId", investigation.id);
                runAction(
                  () => reopenInvestigationAction(fd),
                  "Investigation reopened"
                );
              }}
            >
              <textarea
                name="reason"
                required
                rows={2}
                placeholder="Reason for reopen"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
                Reopen investigation
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {canAct && !closed && (
        <Card>
          <CardHeader>
            <CardTitle>Dismiss</CardTitle>
            <CardDescription>
              Close this investigation as not actionable
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              action={(fd) => {
                fd.set("groupId", investigation.id);
                runAction(
                  () => dismissInvestigationAction(fd),
                  "Investigation dismissed"
                );
              }}
            >
              <textarea
                name="reason"
                required
                rows={2}
                placeholder="Reason for dismissal"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <Button type="submit" variant="danger" size="sm" disabled={isPending}>
                Dismiss
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {investigation.candidates.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pending correlation candidates</CardTitle>
            <CardDescription>
              Accept or reject suggested event relationships
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {investigation.candidates.map((c) => (
              <div
                key={c.id}
                className="rounded-md border border-border px-3 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-mono text-xs text-muted">
                      {c.eventAId.slice(0, 8)}… ↔ {c.eventBId.slice(0, 8)}…
                    </span>
                    <span className="ml-2 text-xs text-muted">
                      score {c.score} · {c.confidence}
                    </span>
                  </div>
                  {canAct && (
                    <div className="flex gap-2">
                      <form
                        action={(fd) => {
                          fd.set("candidateId", c.id);
                          runAction(
                            () => acceptCandidateAction(fd),
                            "Candidate accepted"
                          );
                        }}
                      >
                        <Button type="submit" size="sm" disabled={isPending}>
                          Accept
                        </Button>
                      </form>
                      <form
                        action={(fd) => {
                          fd.set("candidateId", c.id);
                          fd.set("groupId", investigation.id);
                          runAction(
                            () => rejectCandidateAction(fd),
                            "Candidate rejected"
                          );
                        }}
                      >
                        <Button
                          type="submit"
                          size="sm"
                          variant="secondary"
                          disabled={isPending}
                        >
                          Reject
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
                {c.reasons.length > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    {c.reasons.join("; ")}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
