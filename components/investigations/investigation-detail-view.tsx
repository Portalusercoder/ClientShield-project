"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  acceptCandidateAction,
  addEventAction,
  addInvestigationNoteAction,
  assignInvestigationAction,
  closeInvestigationAction,
  confirmInvestigationAction,
  createFindingFromInvestigationAction,
  createIncidentFromInvestigationAction,
  deleteInvestigationNoteAction,
  dismissInvestigationAction,
  editInvestigationNoteAction,
  linkFindingToInvestigationAction,
  linkToIncidentAction,
  manualThreatIntelLookupAction,
  rejectCandidateAction,
  removeEventAction,
  reopenInvestigationAction,
  resolveInvestigationAction,
  startInvestigationAction,
  transitionInvestigationStatusAction,
  unlinkFindingFromInvestigationAction,
} from "@/app/(dashboard)/investigations/actions";
import {
  InvestigationCreatedByBadge,
  InvestigationSeverityBadge,
  InvestigationStatusBadge,
} from "@/components/investigations/investigation-badges";
import { PageBreadcrumbs } from "@/components/workflow/page-breadcrumbs";
import { RelatedObjectsPanel } from "@/components/workflow/related-objects-panel";
import { WorkflowEmptyState } from "@/components/workflow/workflow-empty-state";
import { WorkflowQuickActions } from "@/components/workflow/workflow-quick-actions";
import { WorkflowTrail } from "@/components/workflow/workflow-trail";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";
import { buildWorkflowStages } from "@/lib/workflow/workflow-context";
import type { InvestigationDetailViewModel } from "@/types/investigations";

type Tab =
  | "overview"
  | "events"
  | "observables"
  | "mitre"
  | "notes"
  | "findings"
  | "timeline"
  | "threat-intel"
  | "incidents";

function userLabel(user: {
  name: string | null;
  email: string;
} | null): string {
  if (!user) return "—";
  return user.name?.trim() || user.email;
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}

interface InvestigationDetailViewProps {
  investigation: InvestigationDetailViewModel;
  canAct: boolean;
}

export function InvestigationDetailView({
  investigation,
  canAct,
}: InvestigationDetailViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "events", label: `Events (${investigation.eventCount})` },
    {
      id: "observables",
      label: `Observables (${investigation.observableCount})`,
    },
    { id: "mitre", label: "MITRE" },
    { id: "notes", label: `Notes (${investigation.notes.length})` },
    { id: "findings", label: `Findings (${investigation.findings.length})` },
    { id: "timeline", label: "Timeline" },
    {
      id: "threat-intel",
      label: `Threat Intel (${investigation.threatIntelLookups.length})`,
    },
    {
      id: "incidents",
      label: `Incidents (${investigation.incidentCount})`,
    },
  ];

  function runAction(
    fn: () => Promise<{ success: boolean; error?: string }>,
    successMessage: string
  ) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) {
        setError(result.error ?? "Action failed");
        return;
      }
      setMessage(successMessage);
      router.refresh();
    });
  }

  const closed =
    investigation.status === "DISMISSED" ||
    investigation.status === "CLOSED";
  const canReopen =
    investigation.status === "RESOLVED" || investigation.status === "CLOSED";
  const assignmentHistory = investigation.activities.filter((a) =>
    ["ASSIGNED", "REASSIGNED", "UNASSIGNED"].includes(a.activityType)
  );

  const primaryEvent = investigation.events[0] ?? null;
  const primaryFinding = investigation.findings[0] ?? null;
  const primaryIncident = investigation.incidents[0] ?? null;

  const workflowStages = useMemo(
    () =>
      buildWorkflowStages({
        current: "investigation",
        securityEvent: primaryEvent
          ? {
              id: primaryEvent.securityEventId,
              title: primaryEvent.title,
            }
          : null,
        investigation: {
          id: investigation.id,
          title: investigation.title,
        },
        finding: primaryFinding
          ? { id: primaryFinding.id, title: primaryFinding.title }
          : null,
        incident: primaryIncident
          ? {
              id: primaryIncident.incidentId,
              title: primaryIncident.title,
            }
          : null,
      }),
    [
      investigation.id,
      investigation.title,
      primaryEvent,
      primaryFinding,
      primaryIncident,
    ]
  );

  const relatedObjects = useMemo(() => {
    const items: {
      id: string;
      kind: "security-event" | "finding" | "incident" | "asset";
      label: string;
      href: string;
      meta?: string;
    }[] = [];
    if (investigation.findingCreateDefaults.assetId) {
      items.push({
        id: investigation.findingCreateDefaults.assetId,
        kind: "asset",
        label: "Linked asset",
        href: `/assets/${investigation.findingCreateDefaults.assetId}`,
        meta: "Asset",
      });
    }
    for (const e of investigation.events.slice(0, 5)) {
      items.push({
        id: e.securityEventId,
        kind: "security-event",
        label: e.title,
        href: `/security-events/${e.securityEventId}`,
        meta: e.severity,
      });
    }
    for (const f of investigation.findings.slice(0, 5)) {
      items.push({
        id: f.id,
        kind: "finding",
        label: f.title,
        href: `/vulnerabilities/${f.id}`,
        meta: f.status,
      });
    }
    for (const i of investigation.incidents.slice(0, 5)) {
      items.push({
        id: i.incidentId,
        kind: "incident",
        label: i.title,
        href: `/incidents/${i.incidentId}`,
        meta: i.status,
      });
    }
    return items;
  }, [investigation]);

  const quickActions = useMemo(() => {
    const actions: {
      id: string;
      label: string;
      href: string;
      available: boolean;
    }[] = [];
    if (primaryEvent) {
      actions.push({
        id: "open-se",
        label: "Open Security Event",
        href: `/security-events/${primaryEvent.securityEventId}`,
        available: true,
      });
    }
    if (primaryFinding) {
      actions.push({
        id: "open-finding",
        label: "Open Finding",
        href: `/vulnerabilities/${primaryFinding.id}`,
        available: true,
      });
    }
    if (primaryIncident) {
      actions.push({
        id: "open-incident",
        label: "Open Incident",
        href: `/incidents/${primaryIncident.incidentId}`,
        available: true,
      });
    }
    if (investigation.findingCreateDefaults.assetId) {
      actions.push({
        id: "open-asset",
        label: "Open Asset",
        href: `/assets/${investigation.findingCreateDefaults.assetId}`,
        available: true,
      });
    }
    return actions;
  }, [
    primaryEvent,
    primaryFinding,
    primaryIncident,
    investigation.findingCreateDefaults.assetId,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <PageBreadcrumbs
            items={[
              { label: "Investigations", href: "/investigations" },
              { label: investigation.title.slice(0, 48) },
            ]}
          />
          <WorkflowTrail stages={workflowStages} />
          <h1 className="text-2xl font-semibold text-foreground">
            {investigation.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <InvestigationStatusBadge status={investigation.status} />
            <InvestigationSeverityBadge severity={investigation.severity} />
            <InvestigationCreatedByBadge
              createdByType={investigation.createdByType}
            />
            <span className="text-xs text-muted">
              Assignee: {userLabel(investigation.assignedTo)}
            </span>
          </div>
        </div>

        {canAct && !closed && (
          <div className="flex flex-wrap gap-2">
            {investigation.status === "OPEN" && (
              <Button
                size="sm"
                disabled={isPending}
                onClick={() =>
                  runAction(
                    () => startInvestigationAction(investigation.id),
                    "Investigation started"
                  )
                }
              >
                Start investigation
              </Button>
            )}
            {(investigation.status === "IN_PROGRESS" ||
              investigation.status === "INVESTIGATING" ||
              investigation.status === "CONFIRMED") && (
              <Button
                size="sm"
                variant="secondary"
                disabled={isPending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("groupId", investigation.id);
                  fd.set("toStatus", "PENDING");
                  runAction(
                    () => transitionInvestigationStatusAction(fd),
                    "Marked pending"
                  );
                }}
              >
                Mark pending
              </Button>
            )}
            {investigation.status !== "RESOLVED" &&
              investigation.status !== "DISMISSED" &&
              investigation.status !== "CLOSED" && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("groupId", investigation.id);
                    runAction(
                      () => resolveInvestigationAction(fd),
                      "Investigation resolved"
                    );
                  }}
                >
                  Resolve
                </Button>
              )}
            {investigation.status !== "CONFIRMED" &&
              investigation.status !== "LINKED_TO_INCIDENT" &&
              investigation.status !== "RESOLVED" && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() =>
                    runAction(
                      () => confirmInvestigationAction(investigation.id),
                      "Investigation confirmed"
                    )
                  }
                >
                  Confirm
                </Button>
              )}
          </div>
        )}
      </div>

      {(error || message) && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            error
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-success/40 bg-success/10 text-success"
          }`}
        >
          {error ?? message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <RelatedObjectsPanel
          title="Related objects"
          objects={relatedObjects}
          emptyTitle="No linked workflow objects"
          emptyDescription="Link security events, create a finding, or escalate to an incident to continue the spine."
        />
        <WorkflowQuickActions actions={quickActions} />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === t.id
                ? "bg-accent/15 text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
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
      )}

      {tab === "events" && (
        <div className="space-y-4">
          {canAct && !closed && (
            <Card>
              <CardHeader>
                <CardTitle>Add security event</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="flex flex-col gap-3 sm:flex-row"
                  action={(fd) => {
                    fd.set("groupId", investigation.id);
                    runAction(
                      () => addEventAction(fd),
                      "Event added to investigation"
                    );
                  }}
                >
                  <input
                    name="securityEventId"
                    required
                    placeholder="Security event ID"
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                  />
                  <Button type="submit" size="sm" disabled={isPending}>
                    Add event
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {investigation.events.length === 0 ? (
            <div className="rounded-md border border-border px-4 py-10 text-center text-sm text-muted">
              No events in this investigation.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium">Severity</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Agent</th>
                    <th className="px-4 py-3 font-medium">First / Last</th>
                    {canAct && !closed && (
                      <th className="px-4 py-3 font-medium">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {investigation.events.map((ev) => (
                    <tr key={ev.linkId} className="hover:bg-surface/40">
                      <td className="px-4 py-3">
                        <Link
                          href={`/security-events/${ev.securityEventId}`}
                          className="font-medium text-accent hover:underline"
                        >
                          {ev.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{ev.severity}</td>
                      <td className="px-4 py-3 text-muted">{ev.status}</td>
                      <td className="px-4 py-3 text-muted">
                        {ev.agentName ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        <div>{formatDateTime(ev.firstSeenAt)}</div>
                        <div>{formatDateTime(ev.lastSeenAt)}</div>
                      </td>
                      {canAct && !closed && (
                        <td className="px-4 py-3">
                          <form
                            className="flex flex-col gap-1"
                            action={(fd) => {
                              fd.set("groupId", investigation.id);
                              fd.set("securityEventId", ev.securityEventId);
                              runAction(
                                () => removeEventAction(fd),
                                "Event removed"
                              );
                            }}
                          >
                            <input
                              name="reason"
                              required
                              placeholder="Reason"
                              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                            />
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              disabled={isPending}
                            >
                              Remove
                            </Button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "observables" && (
        <div className="space-y-4">
          {investigation.observables.length === 0 ? (
            <div className="rounded-md border border-border px-4 py-10 text-center text-sm text-muted">
              No observables extracted for events in this investigation.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Value</th>
                    <th className="px-4 py-3 font-medium">Roles</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {investigation.observables.map((obs) => (
                    <tr key={obs.id} className="hover:bg-surface/40">
                      <td className="px-4 py-3 font-mono text-xs text-muted">
                        {obs.type}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">
                        {obs.value}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {obs.roles.join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {canAct &&
                        obs.safeForExternalLookup &&
                        investigation.threatIntelEnabled ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={isPending}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Look up threat intelligence for public observable?\n\n${obs.type}: ${obs.value}\n\nThis may send the value to an external provider.`
                                )
                              ) {
                                return;
                              }
                              const fd = new FormData();
                              fd.set("observableId", obs.id);
                              fd.set("groupId", investigation.id);
                              fd.set("confirm", "true");
                              runAction(
                                () => manualThreatIntelLookupAction(fd),
                                "Threat intel lookup requested"
                              );
                            }}
                          >
                            Check Threat Intelligence
                          </Button>
                        ) : (
                          <span className="text-xs text-muted">
                            {!investigation.threatIntelEnabled
                              ? "Threat intel disabled"
                              : obs.unsafeReason ?? "Not eligible for lookup"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "mitre" && (
        <Card>
          <CardHeader>
            <CardTitle>MITRE ATT&CK</CardTitle>
            <CardDescription>
              Aggregated tactics and techniques from member events
            </CardDescription>
          </CardHeader>
          <CardContent>
            {investigation.mitreTactics.length === 0 &&
            investigation.mitreTechniques.length === 0 ? (
              <p className="text-sm text-muted">
                No MITRE tactics or techniques recorded for events in this
                investigation.
              </p>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">
                    Tactics
                  </h3>
                  {investigation.mitreTactics.length === 0 ? (
                    <p className="text-sm text-muted">None</p>
                  ) : (
                    <ul className="space-y-1">
                      {investigation.mitreTactics.map((t) => (
                        <li
                          key={t}
                          className="rounded border border-border px-2 py-1 font-mono text-xs"
                        >
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">
                    Techniques
                  </h3>
                  {investigation.mitreTechniques.length === 0 ? (
                    <p className="text-sm text-muted">None</p>
                  ) : (
                    <ul className="space-y-1">
                      {investigation.mitreTechniques.map((t) => (
                        <li
                          key={t}
                          className="rounded border border-border px-2 py-1 font-mono text-xs"
                        >
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "notes" && (
        <div className="space-y-4">
          {canAct && !closed && (
            <Card>
              <CardHeader>
                <CardTitle>Add note</CardTitle>
                <CardDescription>Analyst collaboration notes</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-3"
                  action={(fd) => {
                    fd.set("groupId", investigation.id);
                    runAction(
                      () => addInvestigationNoteAction(fd),
                      "Note added"
                    );
                  }}
                >
                  <textarea
                    name="content"
                    required
                    rows={3}
                    placeholder="Write an analyst note…"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                  <Button type="submit" size="sm" disabled={isPending}>
                    Add note
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
          {investigation.notes.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted">
                No notes yet.
              </CardContent>
            </Card>
          ) : (
            investigation.notes.map((note) => (
              <Card key={note.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {note.authorName || note.authorEmail || "Analyst"}
                  </CardTitle>
                  <CardDescription>
                    {formatDateTime(note.createdAt)}
                    {note.editedAt
                      ? ` · edited ${formatDateTime(note.editedAt)}`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {canAct && !closed ? (
                    <form
                      className="space-y-3"
                      action={(fd) => {
                        fd.set("groupId", investigation.id);
                        fd.set("noteId", note.id);
                        runAction(
                          () => editInvestigationNoteAction(fd),
                          "Note updated"
                        );
                      }}
                    >
                      <textarea
                        name="content"
                        required
                        rows={3}
                        defaultValue={note.content}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" size="sm" disabled={isPending}>
                          Save edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={isPending}
                          onClick={() => {
                            const fd = new FormData();
                            fd.set("groupId", investigation.id);
                            fd.set("noteId", note.id);
                            runAction(
                              () => deleteInvestigationNoteAction(fd),
                              "Note deleted"
                            );
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {note.content}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "timeline" && (
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
            <CardDescription>
              Chronological security events and investigation activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const eventEntries = investigation.events.map((ev) => ({
                id: `event-${ev.linkId}`,
                at: ev.firstSeenAt,
                kind: "event" as const,
                title: ev.title,
                detail: `${ev.severity} · ${ev.status}`,
                href: `/security-events/${ev.securityEventId}`,
              }));
              const activityEntries = investigation.activities.map((a) => ({
                id: `activity-${a.id}`,
                at: a.createdAt,
                kind: "activity" as const,
                title: a.message,
                detail: [
                  a.activityType.replaceAll("_", " "),
                  a.actorName || a.actorEmail || null,
                  a.note ? a.note.slice(0, 120) : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
                href: null as string | null,
              }));
              const entries = [...eventEntries, ...activityEntries].sort(
                (a, b) => a.at.getTime() - b.at.getTime()
              );
              if (entries.length === 0) {
                return (
                  <p className="text-sm text-muted">No timeline entries yet.</p>
                );
              }
              return (
                <ol className="space-y-3">
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex gap-3 border-b border-border/50 pb-3 last:border-0"
                    >
                      <div className="w-40 shrink-0 text-xs text-muted">
                        {formatDateTime(entry.at)}
                      </div>
                      <div className="min-w-0 flex-1">
                        {entry.href ? (
                          <Link
                            href={entry.href}
                            className="text-sm font-medium text-accent hover:underline"
                          >
                            {entry.title}
                          </Link>
                        ) : (
                          <p className="text-sm font-medium text-foreground">
                            {entry.title}
                          </p>
                        )}
                        <p className="text-xs text-muted">{entry.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {tab === "threat-intel" && (
        <div className="space-y-4">
          {!investigation.threatIntelConfigured && (
            <div className="rounded-md border border-border bg-surface/40 px-4 py-3 text-sm text-muted">
              Threat intelligence provider is not configured. Lookups are
              disabled or will return an unconfigured response until a provider
              is set.
            </div>
          )}
          {!investigation.threatIntelEnabled && (
            <div className="rounded-md border border-border bg-surface/40 px-4 py-3 text-sm text-muted">
              Threat intelligence lookups are disabled for this environment.
            </div>
          )}
          {investigation.threatIntelLookups.length === 0 ? (
            <div className="rounded-md border border-border px-4 py-10 text-center text-sm text-muted">
              No threat intelligence lookups recorded for observables in this
              investigation.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Provider</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Risk</th>
                    <th className="px-4 py-3 font-medium">Summary</th>
                    <th className="px-4 py-3 font-medium">Looked up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {investigation.threatIntelLookups.map((row) => {
                    const obs = investigation.observables.find(
                      (o) => o.id === row.observableId
                    );
                    return (
                      <tr key={row.id} className="hover:bg-surface/40">
                        <td className="px-4 py-3">
                          <div className="text-sm">{row.provider}</div>
                          {obs && (
                            <div className="font-mono text-xs text-muted">
                              {obs.type}: {obs.value}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted">{row.status}</td>
                        <td className="px-4 py-3 text-muted">
                          {row.riskLevel ?? "—"}
                        </td>
                        <td className="max-w-[320px] px-4 py-3 text-xs text-muted">
                          {row.summary ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {formatDateTime(row.lookedUpAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "findings" && (
        <div className="space-y-4">
          <p className="text-xs text-muted">
            Findings record what was concluded from this investigation. Closing
            the investigation does not change Finding status; resolving a Finding
            does not change the investigation.
          </p>
          {investigation.findings.length === 0 ? (
            <WorkflowEmptyState
              title="No Findings yet"
              why="An Investigation concludes by recording Findings — nothing has been created or linked."
              nextAction="Create a Finding from this investigation or link an existing one below."
              actionLabel={canAct && !closed ? "Scroll to create" : null}
              actionHref={canAct && !closed ? "#create-finding" : null}
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Severity</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Asset</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {investigation.findings.map((f) => (
                    <tr key={f.id} className="hover:bg-surface/40">
                      <td className="px-4 py-3">
                        <Link
                          href={`/vulnerabilities/${f.id}`}
                          className="font-medium text-foreground hover:text-accent"
                        >
                          {f.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{f.severity}</td>
                      <td className="px-4 py-3 text-muted">{f.status}</td>
                      <td className="px-4 py-3 text-muted">
                        {f.assetName ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {canAct ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={isPending}
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("groupId", investigation.id);
                              fd.set("findingId", f.id);
                              runAction(
                                () => unlinkFindingFromInvestigationAction(fd),
                                "Finding unlinked"
                              );
                            }}
                          >
                            Unlink
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canAct && !closed && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                <div id="create-finding">
                  <CardTitle>Create Finding</CardTitle>
                </div>
                  <CardDescription>
                    Analyst-confirmed only. Severity may inherit once; statuses
                    stay independent afterward.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-3"
                    action={(fd) => {
                      fd.set("groupId", investigation.id);
                      runAction(async () => {
                        const result =
                          await createFindingFromInvestigationAction(fd);
                        if (result.success && result.data?.findingId) {
                          router.push(
                            `/vulnerabilities/${result.data.findingId}`
                          );
                        }
                        return result;
                      }, "Finding created");
                    }}
                  >
                    <input
                      name="title"
                      required
                      defaultValue={investigation.findingCreateDefaults.title}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      placeholder="Finding title"
                    />
                    <textarea
                      name="description"
                      rows={4}
                      defaultValue={
                        investigation.findingCreateDefaults.description
                      }
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      placeholder="Description"
                    />
                    <select
                      name="severity"
                      defaultValue={
                        investigation.findingCreateDefaults.severity
                      }
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map(
                        (s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        )
                      )}
                    </select>
                    <select
                      name="assetId"
                      required
                      defaultValue={
                        investigation.findingCreateDefaults.assetId ?? ""
                      }
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="" disabled>
                        Select asset…
                      </option>
                      {investigation.orgAssets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        name="inheritAssignee"
                        value="true"
                        defaultChecked={Boolean(
                          investigation.findingCreateDefaults.assignedToUserId
                        )}
                      />
                      Assign to investigation assignee (optional)
                    </label>
                    <Button type="submit" size="sm" disabled={isPending}>
                      Create Finding
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Link existing Finding</CardTitle>
                  <CardDescription>
                    Sets this investigation as the Finding&apos;s primary
                    investigation.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {investigation.linkableFindings.length === 0 ? (
                    <p className="text-sm text-muted">
                      No linkable findings in scope.
                    </p>
                  ) : (
                    <form
                      className="space-y-3"
                      action={(fd) => {
                        fd.set("groupId", investigation.id);
                        runAction(
                          () => linkFindingToInvestigationAction(fd),
                          "Finding linked"
                        );
                      }}
                    >
                      <select
                        name="findingId"
                        required
                        defaultValue=""
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="" disabled>
                          Select finding…
                        </option>
                        {investigation.linkableFindings.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.title} ({f.severity}/{f.status})
                            {f.alreadyLinkedElsewhere
                              ? " — linked elsewhere"
                              : ""}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" size="sm" disabled={isPending}>
                        Link Finding
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {tab === "incidents" && (
        <div className="space-y-4">
          {investigation.incidents.length === 0 ? (
            <WorkflowEmptyState
              title="No Incident yet"
              why="Incidents capture response cases escalated from investigations."
              nextAction="Create or link an Incident when confirmed impact requires response."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Case</th>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Severity</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {investigation.incidents.map((inc) => (
                    <tr key={inc.linkId} className="hover:bg-surface/40">
                      <td className="px-4 py-3">
                        <Link
                          href={`/incidents/${inc.incidentId}`}
                          className="font-mono text-xs font-semibold text-accent hover:underline"
                        >
                          {inc.caseNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/incidents/${inc.incidentId}`}
                          className="font-medium text-foreground hover:text-accent"
                        >
                          {inc.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{inc.severity}</td>
                      <td className="px-4 py-3 text-muted">{inc.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canAct && !closed && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Link existing incident</CardTitle>
                  <CardDescription>
                    Attach this investigation to an open case. Confirmation
                    required.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-3"
                    action={(fd) => {
                      fd.set("groupId", investigation.id);
                      runAction(
                        () => linkToIncidentAction(fd),
                        "Linked to incident"
                      );
                    }}
                  >
                    <select
                      name="incidentId"
                      required
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Select incident…
                      </option>
                      {investigation.linkableIncidents.map((inc) => (
                        <option key={inc.id} value={inc.id}>
                          {inc.caseNumber} — {inc.title}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-start gap-2 text-sm text-muted">
                      <input
                        type="checkbox"
                        name="confirm"
                        value="true"
                        required
                        className="mt-1"
                      />
                      <span>
                        I confirm linking this investigation ({investigation.eventCount}{" "}
                        events, {investigation.severity} severity) to the selected
                        incident.
                      </span>
                    </label>
                    <Button type="submit" size="sm" disabled={isPending}>
                      Link to incident
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Create incident from investigation</CardTitle>
                  <CardDescription>
                    Escalates member events into a new incident case.
                    Confirmation required — never automatic.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-3"
                    action={(fd) => {
                      fd.set("groupId", investigation.id);
                      runAction(
                        () => createIncidentFromInvestigationAction(fd),
                        "Incident created from investigation"
                      );
                    }}
                  >
                    <input
                      name="title"
                      placeholder={`Investigation: ${investigation.title}`}
                      maxLength={300}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                    <textarea
                      name="description"
                      rows={2}
                      placeholder="Optional description"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                    <select
                      name="severity"
                      defaultValue={investigation.severity}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map(
                        (s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        )
                      )}
                    </select>
                    <div className="rounded-md border border-border bg-surface/40 px-3 py-2 text-xs text-muted">
                      <p className="font-medium text-foreground">
                        Confirmation summary
                      </p>
                      <ul className="mt-1 list-inside list-disc space-y-0.5">
                        <li>{investigation.eventCount} security event(s)</li>
                        <li>Severity: {investigation.severity}</li>
                        <li>
                          {investigation.createdByType === "SYSTEM_SUGGESTED"
                            ? "System suggested"
                            : "Analyst created"}{" "}
                          investigation
                        </li>
                      </ul>
                    </div>
                    <label className="flex items-start gap-2 text-sm text-muted">
                      <input
                        type="checkbox"
                        name="confirm"
                        value="true"
                        required
                        className="mt-1"
                      />
                      <span>
                        I confirm creating a new incident from this investigation.
                      </span>
                    </label>
                    <Button type="submit" size="sm" disabled={isPending}>
                      Create incident
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
