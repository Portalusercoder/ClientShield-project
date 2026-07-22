"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addEvidenceNoteAction,
  addIncidentNoteAction,
  assignIncidentAction,
  assignPlaybookAction,
  assignResponseTaskAction,
  createResponseTaskAction,
  generateIncidentCasePdfAction,
  linkEvidenceFindingAction,
  linkEvidenceSecurityEventAction,
  linkFindingAction,
  searchFindingsForLinkAction,
  setCommanderAction,
  setLeadAnalystAction,
  unlinkFindingAction,
  updateIncidentResponseAction,
  updateIncidentSeverityAction,
  updateIncidentStatusAction,
  updateResponseTaskStatusAction,
} from "@/app/(dashboard)/incidents/actions";
import {
  IncidentSeverityBadge,
  IncidentStatusBadge,
} from "@/components/incidents/incident-badges";
import { SecurityEventSeverityBadge } from "@/components/security-events/security-event-badges";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { INCIDENT_STATUS_ACTIONS } from "@/services/incidents/status-transitions";
import type {
  EvidenceItem,
  PlaybookListItem,
  PlaybookSuggestion,
  ResponseTaskItem,
} from "@/types/incident-case";
import type { IncidentDetail } from "@/types/incidents";
import type { IncidentStatus, ResponseTaskStatus } from "@prisma/client";

type Tab =
  | "overview"
  | "timeline"
  | "playbook"
  | "tasks"
  | "evidence"
  | "security-events"
  | "findings"
  | "response"
  | "post-incident"
  | "notes";

interface LinkedSecurityEventRow {
  linkId: string;
  id: string;
  title: string;
  severity: string;
  status: string;
  ruleId: string | null;
  ruleDescription?: string | null;
  occurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  assetId?: string | null;
  assetName?: string | null;
}

interface PlaybookInstanceRow {
  id: string;
  playbookName: string;
  sourcePlaybookId: string | null;
  assignedAt: Date;
  assignedByName: string | null;
  taskCount: number;
}

interface CandidateUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

const PHASE_STEPS: { status: IncidentStatus; label: string }[] = [
  { status: "OPEN", label: "Open" },
  { status: "ACKNOWLEDGED", label: "Triage" },
  { status: "INVESTIGATING", label: "Investigate" },
  { status: "CONTAINED", label: "Contain" },
  { status: "ERADICATED", label: "Eradicate" },
  { status: "RECOVERING", label: "Recover" },
  { status: "RESOLVED", label: "Resolve" },
  { status: "CLOSED", label: "Close" },
];

const TASK_STATUSES: ResponseTaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "SKIPPED",
];

const PLAYBOOK_PHASES = [
  "INVESTIGATION",
  "CONTAINMENT",
  "ERADICATION",
  "RECOVERY",
  "POST_INCIDENT",
] as const;

function formatDuration(ms: number | null): string {
  if (ms == null) return "N/A";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 48) return `${hours}h ${rem}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
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

function PhaseStepper({ status }: { status: IncidentStatus }) {
  const currentIdx = PHASE_STEPS.findIndex((s) => s.status === status);
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface/40 px-3 py-3">
      <ol className="flex min-w-[640px] items-center gap-1">
        {PHASE_STEPS.map((step, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <li key={step.status} className="flex flex-1 items-center gap-1">
              <div className="flex min-w-0 flex-col items-center gap-1">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    active
                      ? "bg-accent text-white"
                      : done
                        ? "bg-success/20 text-success"
                        : "bg-border/60 text-muted"
                  }`}
                >
                  {idx + 1}
                </span>
                <span
                  className={`truncate text-[10px] uppercase tracking-wide ${
                    active ? "text-accent" : "text-muted"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < PHASE_STEPS.length - 1 && (
                <div
                  className={`mb-4 h-0.5 flex-1 ${
                    done ? "bg-success/50" : "bg-border"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface IncidentDetailViewProps {
  incident: IncidentDetail;
  securityEvents: LinkedSecurityEventRow[];
  playbooks: PlaybookListItem[];
  suggestion: PlaybookSuggestion | null;
  playbookInstances: PlaybookInstanceRow[];
  tasks: ResponseTaskItem[];
  evidence: EvidenceItem[];
  leadCandidates: CandidateUser[];
  commanderCandidates: CandidateUser[];
  canManage: boolean;
  canClose: boolean;
  canCommand: boolean;
}

export function IncidentDetailView({
  incident,
  securityEvents,
  playbooks,
  suggestion,
  playbookInstances,
  tasks,
  evidence,
  leadCandidates,
  commanderCandidates,
  canManage,
  canClose,
  canCommand,
}: IncidentDetailViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [findingSearch, setFindingSearch] = useState("");
  const [findingResults, setFindingResults] = useState<
    {
      id: string;
      title: string;
      severity: string;
      status: string;
      assetName: string | null;
    }[]
  >([]);
  const [closeNote, setCloseNote] = useState("");
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [taskReasons, setTaskReasons] = useState<
    Record<string, { blockedReason: string; skipReason: string; completionNote: string }>
  >({});
  const [confirmPlaybookId, setConfirmPlaybookId] = useState<string | null>(
    null
  );

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

  function transitionTo(
    status: IncidentStatus,
    extras?: { reason?: string; closingNote?: string }
  ) {
    const fd = new FormData();
    fd.set("status", status);
    if (extras?.reason) fd.set("reason", extras.reason);
    if (extras?.closingNote) fd.set("closingNote", extras.closingNote);
    runAction(() => updateIncidentStatusAction(incident.id, fd));
  }

  function getTaskReason(taskId: string) {
    return (
      taskReasons[taskId] ?? {
        blockedReason: "",
        skipReason: "",
        completionNote: "",
      }
    );
  }

  function downloadPdf() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await generateIncidentCasePdfAction(incident.id);
      if (!result.success) {
        setError(result.error ?? "PDF generation failed");
        return;
      }
      const binary = atob(result.data.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.data.filename;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Case PDF downloaded.");
    });
  }

  const primary = INCIDENT_STATUS_ACTIONS[incident.status];
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "timeline", label: "Timeline" },
    { id: "playbook", label: "Playbook" },
    { id: "tasks", label: "Tasks" },
    { id: "evidence", label: "Evidence" },
    { id: "security-events", label: "Security Events" },
    { id: "findings", label: "Findings" },
    { id: "response", label: "Response" },
    { id: "post-incident", label: "Post-Incident" },
    { id: "notes", label: "Notes" },
  ];

  const linkedFindingIds = new Set(incident.findings.map((f) => f.findingId));
  const evidencedSeIds = new Set(
    evidence
      .filter((e) => e.type === "SECURITY_EVENT" && e.sourceReferenceId)
      .map((e) => e.sourceReferenceId as string)
  );
  const evidencedFindingIds = new Set(
    evidence
      .filter((e) => e.type === "FINDING" && e.sourceReferenceId)
      .map((e) => e.sourceReferenceId as string)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs text-muted">
            <Link href="/incidents" className="hover:text-accent">
              Incidents
            </Link>
            {" / "}
            <span className="font-mono font-semibold text-accent">
              {incident.caseNumber}
            </span>
          </p>
          <p className="mt-2 font-mono text-sm font-semibold tracking-wide text-accent">
            {incident.caseNumber}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            {incident.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <IncidentSeverityBadge severity={incident.severity} />
            <IncidentStatusBadge status={incident.status} />
            <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted">
              {incident.currentPhase}
            </span>
            <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted">
              {incident.category.replaceAll("_", " ")}
            </span>
            <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted">
              {incident.source.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            {incident.clientName}
            {incident.assetName ? ` · ${incident.assetName}` : ""}
            {" · Lead: "}
            {incident.leadAnalystName ?? "Unassigned"}
            {" · Commander: "}
            {incident.commanderName ?? "Unassigned"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={downloadPdf}
            >
              Export Case PDF
            </Button>
          )}
          {canManage &&
            primary &&
            primary.to !== "CLOSED" &&
            incident.allowedTransitions.includes(primary.to) && (
              <Button
                disabled={isPending}
                onClick={() => transitionTo(primary.to)}
              >
                {primary.label}
              </Button>
            )}
          {canManage &&
            canClose &&
            primary?.to === "CLOSED" &&
            incident.allowedTransitions.includes("CLOSED") && (
              <Button
                disabled={isPending}
                onClick={() => {
                  setShowCloseForm(true);
                  setShowReopenForm(false);
                }}
              >
                Close
              </Button>
            )}
          {canManage &&
            canClose &&
            incident.allowedTransitions.includes("INVESTIGATING") &&
            (incident.status === "RESOLVED" ||
              incident.status === "CLOSED") && (
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => {
                  setShowReopenForm(true);
                  setShowCloseForm(false);
                }}
              >
                Reopen
              </Button>
            )}
          {canManage &&
            incident.allowedTransitions
              .filter(
                (s) =>
                  s !== primary?.to &&
                  s !== "INVESTIGATING" &&
                  s !== "CLOSED"
              )
              .slice(0, 2)
              .map((s) => (
                <Button
                  key={s}
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => transitionTo(s)}
                >
                  {s.replaceAll("_", " ")}
                </Button>
              ))}
        </div>
      </div>

      <PhaseStepper status={incident.status} />

      {showCloseForm && canClose && (
        <Card>
          <CardHeader>
            <CardTitle>Close Incident</CardTitle>
            <CardDescription>
              A closing note is required before the case can be closed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
              rows={3}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Closing note / final disposition…"
            />
            <div className="flex gap-2">
              <Button
                disabled={isPending || closeNote.trim().length < 3}
                onClick={() => {
                  transitionTo("CLOSED", { closingNote: closeNote.trim() });
                  setShowCloseForm(false);
                  setCloseNote("");
                }}
              >
                Confirm Close
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowCloseForm(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showReopenForm && canClose && (
        <Card>
          <CardHeader>
            <CardTitle>Reopen Incident</CardTitle>
            <CardDescription>
              Provide a reason for reopening this case.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Reason for reopen…"
            />
            <div className="flex gap-2">
              <Button
                disabled={isPending || reopenReason.trim().length < 3}
                onClick={() => {
                  transitionTo("INVESTIGATING", {
                    reason: reopenReason.trim(),
                  });
                  setShowReopenForm(false);
                  setReopenReason("");
                }}
              >
                Confirm Reopen
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowReopenForm(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
              <CardTitle>Case Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Case number" value={incident.caseNumber} />
                <Field label="Phase" value={incident.currentPhase} />
                <Field label="Client" value={incident.clientName} />
                <Field label="Asset" value={incident.assetName} />
                <Field
                  label="Category"
                  value={incident.category.replaceAll("_", " ")}
                />
                <Field
                  label="Source"
                  value={incident.source.replaceAll("_", " ")}
                />
                <Field
                  label="Detection method"
                  value={incident.detectionMethod.replaceAll("_", " ")}
                />
                <Field
                  label="External source ID"
                  value={incident.externalSourceId}
                />
                <Field
                  label="Assigned analyst"
                  value={
                    incident.assignedToName ??
                    incident.assignedToEmail ??
                    "Unassigned"
                  }
                />
                <Field
                  label="Lead analyst"
                  value={
                    incident.leadAnalystName ??
                    incident.leadAnalystEmail ??
                    "Unassigned"
                  }
                />
                <Field
                  label="Commander"
                  value={
                    incident.commanderName ??
                    incident.commanderEmail ??
                    "Unassigned"
                  }
                />
                <Field label="Created by" value={incident.createdByName} />
              </dl>

              {canManage && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      runAction(() =>
                        updateIncidentSeverityAction(incident.id, fd)
                      );
                    }}
                    className="space-y-2"
                  >
                    <label className="block text-xs text-muted">
                      Change severity
                    </label>
                    <div className="flex gap-2">
                      <select
                        name="severity"
                        defaultValue={incident.severity}
                        className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      >
                        {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map(
                          (s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          )
                        )}
                      </select>
                      <Button type="submit" disabled={isPending} size="sm">
                        Update
                      </Button>
                    </div>
                  </form>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      runAction(() => assignIncidentAction(incident.id, fd));
                    }}
                    className="space-y-2"
                  >
                    <label className="block text-xs text-muted">
                      Assign analyst
                    </label>
                    <div className="flex gap-2">
                      <select
                        name="assignedToUserId"
                        defaultValue={incident.assignedToUserId ?? ""}
                        className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      >
                        <option value="">Unassigned</option>
                        {incident.users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name ?? u.email}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" disabled={isPending} size="sm">
                        Assign
                      </Button>
                    </div>
                  </form>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      runAction(() => setLeadAnalystAction(incident.id, fd));
                    }}
                    className="space-y-2"
                  >
                    <label className="block text-xs text-muted">
                      Lead analyst
                    </label>
                    <div className="flex gap-2">
                      <select
                        name="leadAnalystUserId"
                        defaultValue={incident.leadAnalystUserId ?? ""}
                        className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      >
                        <option value="">Unassigned</option>
                        {leadCandidates.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name ?? u.email}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" disabled={isPending} size="sm">
                        Set
                      </Button>
                    </div>
                  </form>
                  {canCommand && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        runAction(() => setCommanderAction(incident.id, fd));
                      }}
                      className="space-y-2"
                    >
                      <label className="block text-xs text-muted">
                        Incident commander
                      </label>
                      <div className="flex gap-2">
                        <select
                          name="commanderUserId"
                          defaultValue={incident.commanderUserId ?? ""}
                          className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                        >
                          <option value="">Unassigned</option>
                          {commanderCandidates.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name ?? u.email}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" disabled={isPending} size="sm">
                          Set
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timestamps & SLA</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Occurred"
                  value={
                    incident.occurredAt
                      ? formatDate(incident.occurredAt)
                      : null
                  }
                />
                <Field label="Detected" value={formatDate(incident.detectedAt)} />
                <Field label="Reported" value={formatDate(incident.reportedAt)} />
                <Field
                  label="Acknowledged"
                  value={
                    incident.acknowledgedAt
                      ? formatDate(incident.acknowledgedAt)
                      : null
                  }
                />
                <Field
                  label="Investigation started"
                  value={
                    incident.investigationStartedAt
                      ? formatDate(incident.investigationStartedAt)
                      : null
                  }
                />
                <Field
                  label="Contained"
                  value={
                    incident.containedAt
                      ? formatDate(incident.containedAt)
                      : null
                  }
                />
                <Field
                  label="Resolved"
                  value={
                    incident.resolvedAt
                      ? formatDate(incident.resolvedAt)
                      : null
                  }
                />
                <Field
                  label="Closed"
                  value={
                    incident.closedAt ? formatDate(incident.closedAt) : null
                  }
                />
                <Field
                  label="Time to acknowledge"
                  value={formatDuration(incident.sla.timeToAcknowledgeMs)}
                />
                <Field
                  label="Time to contain"
                  value={formatDuration(incident.sla.timeToContainMs)}
                />
                <Field
                  label="Time to resolve"
                  value={formatDuration(incident.sla.timeToResolveMs)}
                />
              </dl>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Impact & Description</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">
                  Description
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {incident.description || "No description provided."}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">
                    Business impact
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {incident.businessImpact || "Not documented yet."}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">
                    Technical impact
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {incident.technicalImpact || "Not documented yet."}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">
                    Impact summary
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {incident.impactSummary || "Not documented yet."}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">
                    Scope summary
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {incident.scopeSummary || "Not documented yet."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "timeline" && (
        <Card>
          <CardHeader>
            <CardTitle>Activity Timeline</CardTitle>
            <CardDescription>
              Append-only history of workflow and analyst actions (newest first).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {incident.activities.length === 0 ? (
              <p className="text-sm text-muted">No activity recorded yet.</p>
            ) : (
              <ol className="space-y-4">
                {incident.activities.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {a.message}
                        </p>
                        <p className="text-xs text-muted">
                          {formatRelativeTime(a.createdAt)}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {a.activityType.replaceAll("_", " ")}
                        {" · "}
                        {a.actorName ?? a.actorEmail ?? "System"}
                        {" · "}
                        {formatDate(a.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "playbook" && (
        <div className="space-y-4">
          {suggestion && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Suggested Playbook
                  <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                    Suggested
                  </span>
                </CardTitle>
                <CardDescription>{suggestion.reason}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  {suggestion.playbookName || suggestion.name}
                </p>
                {canManage && (
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      setConfirmPlaybookId(suggestion.playbookId)
                    }
                  >
                    Assign suggested
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {playbookInstances.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Assigned Playbooks</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {playbookInstances.map((inst) => (
                    <li
                      key={inst.id}
                      className="rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <p className="font-medium">{inst.playbookName}</p>
                      <p className="text-xs text-muted">
                        {inst.taskCount} tasks · assigned{" "}
                        {formatRelativeTime(inst.assignedAt)}
                        {inst.assignedByName
                          ? ` by ${inst.assignedByName}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Available Playbooks</CardTitle>
              <CardDescription>
                Assign a response playbook to generate tasks for this case.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {playbooks.length === 0 ? (
                <p className="text-sm text-muted">No playbooks available.</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {playbooks.map((pb) => {
                    const isSuggested = suggestion?.playbookId === pb.id;
                    return (
                      <li
                        key={pb.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm"
                      >
                        <div>
                          <p className="font-medium">
                            {pb.name}
                            {isSuggested && (
                              <span className="ml-2 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                                Suggested
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted">
                            {pb.stepCount} steps
                            {pb.category
                              ? ` · ${pb.category.replaceAll("_", " ")}`
                              : ""}
                            {pb.description ? ` — ${pb.description}` : ""}
                          </p>
                        </div>
                        {canManage && (
                          <Button
                            size="sm"
                            variant={isSuggested ? "primary" : "secondary"}
                            disabled={isPending}
                            onClick={() => setConfirmPlaybookId(pb.id)}
                          >
                            Assign
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {confirmPlaybookId && (
            <Card>
              <CardHeader>
                <CardTitle>Confirm Playbook Assignment</CardTitle>
                <CardDescription>
                  This will create response tasks from the playbook steps.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button
                  disabled={isPending}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("playbookId", confirmPlaybookId);
                    runAction(async () => {
                      const result = await assignPlaybookAction(
                        incident.id,
                        fd
                      );
                      if (result.success) setConfirmPlaybookId(null);
                      return result;
                    });
                  }}
                >
                  Confirm assign
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmPlaybookId(null)}
                >
                  Cancel
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-4">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Create Response Task</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-3 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const fd = new FormData(form);
                    runAction(async () => {
                      const result = await createResponseTaskAction(
                        incident.id,
                        fd
                      );
                      if (result.success) form.reset();
                      return result;
                    });
                  }}
                >
                  <input
                    name="title"
                    required
                    placeholder="Task title"
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
                  />
                  <select
                    name="phase"
                    defaultValue="INVESTIGATION"
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {PLAYBOOK_PHASES.map((p) => (
                      <option key={p} value={p}>
                        {p.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <select
                    name="priority"
                    defaultValue="MEDIUM"
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <textarea
                    name="description"
                    rows={2}
                    placeholder="Description (optional)"
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
                  />
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input type="checkbox" name="isRequired" value="true" />
                    Required for closure
                  </label>
                  <Button type="submit" disabled={isPending} size="sm">
                    Add Task
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Response Tasks</CardTitle>
              <CardDescription>
                Update status; BLOCKED and SKIPPED require a reason.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted">No response tasks yet.</p>
              ) : (
                <ul className="space-y-4">
                  {tasks.map((task) => {
                    const reasons = getTaskReason(task.id);
                    return (
                      <li
                        key={task.id}
                        className="rounded-md border border-border px-4 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">
                              {task.title}
                              {task.isRequired && (
                                <span className="ml-2 text-[10px] uppercase text-danger">
                                  Required
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-xs text-muted">
                              {task.phase.replaceAll("_", " ")} ·{" "}
                              {task.priority} ·{" "}
                              {task.assignedToName ?? "Unassigned"}
                            </p>
                            {task.description && (
                              <p className="mt-1 text-sm text-muted">
                                {task.description}
                              </p>
                            )}
                            {task.blockedReason && (
                              <p className="mt-1 text-xs text-warning">
                                Blocked: {task.blockedReason}
                              </p>
                            )}
                            {task.skipReason && (
                              <p className="mt-1 text-xs text-muted">
                                Skipped: {task.skipReason}
                              </p>
                            )}
                          </div>
                          <span className="rounded-md border border-border px-2 py-0.5 text-xs">
                            {task.status.replaceAll("_", " ")}
                          </span>
                        </div>

                        {canManage && (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="space-y-2">
                              <label className="block text-xs text-muted">
                                Change status
                              </label>
                              <select
                                value={task.status}
                                disabled={isPending}
                                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                                onChange={(e) => {
                                  const status = e.target
                                    .value as ResponseTaskStatus;
                                  const fd = new FormData();
                                  fd.set("status", status);
                                  const r = getTaskReason(task.id);
                                  if (status === "BLOCKED") {
                                    if (!r.blockedReason.trim()) {
                                      setError(
                                        "Blocked reason is required for BLOCKED status."
                                      );
                                      return;
                                    }
                                    fd.set("blockedReason", r.blockedReason);
                                  }
                                  if (status === "SKIPPED") {
                                    if (!r.skipReason.trim()) {
                                      setError(
                                        "Skip reason is required for SKIPPED status."
                                      );
                                      return;
                                    }
                                    fd.set("skipReason", r.skipReason);
                                  }
                                  if (
                                    status === "COMPLETED" &&
                                    r.completionNote.trim()
                                  ) {
                                    fd.set(
                                      "completionNote",
                                      r.completionNote
                                    );
                                  }
                                  runAction(() =>
                                    updateResponseTaskStatusAction(
                                      incident.id,
                                      task.id,
                                      fd
                                    )
                                  );
                                }}
                              >
                                {TASK_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {s.replaceAll("_", " ")}
                                  </option>
                                ))}
                              </select>
                              <input
                                value={reasons.blockedReason}
                                onChange={(e) =>
                                  setTaskReasons((prev) => ({
                                    ...prev,
                                    [task.id]: {
                                      ...getTaskReason(task.id),
                                      blockedReason: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Blocked reason"
                                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                              />
                              <input
                                value={reasons.skipReason}
                                onChange={(e) =>
                                  setTaskReasons((prev) => ({
                                    ...prev,
                                    [task.id]: {
                                      ...getTaskReason(task.id),
                                      skipReason: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Skip reason"
                                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                              />
                              <input
                                value={reasons.completionNote}
                                onChange={(e) =>
                                  setTaskReasons((prev) => ({
                                    ...prev,
                                    [task.id]: {
                                      ...getTaskReason(task.id),
                                      completionNote: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Completion note (optional)"
                                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                              />
                            </div>
                            <form
                              className="space-y-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                const fd = new FormData(e.currentTarget);
                                runAction(() =>
                                  assignResponseTaskAction(
                                    incident.id,
                                    task.id,
                                    fd
                                  )
                                );
                              }}
                            >
                              <label className="block text-xs text-muted">
                                Assign task
                              </label>
                              <div className="flex gap-2">
                                <select
                                  name="assignedToUserId"
                                  defaultValue={task.assignedToUserId ?? ""}
                                  className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                                >
                                  <option value="">Unassigned</option>
                                  {incident.users.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.name ?? u.email}
                                    </option>
                                  ))}
                                </select>
                                <Button
                                  type="submit"
                                  size="sm"
                                  disabled={isPending}
                                >
                                  Assign
                                </Button>
                              </div>
                            </form>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "evidence" && (
        <div className="space-y-4">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Add Note Evidence</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const fd = new FormData(form);
                    runAction(async () => {
                      const result = await addEvidenceNoteAction(
                        incident.id,
                        fd
                      );
                      if (result.success) form.reset();
                      return result;
                    });
                  }}
                >
                  <input
                    name="title"
                    required
                    placeholder="Evidence title"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                  <textarea
                    name="description"
                    rows={2}
                    placeholder="Description (optional)"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                  <input
                    name="url"
                    type="url"
                    placeholder="URL (optional)"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                  <Button type="submit" disabled={isPending} size="sm">
                    Add Evidence Note
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {canManage && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Link Security Event Evidence</CardTitle>
                  <CardDescription>
                    From events already linked to this incident.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {securityEvents.length === 0 ? (
                    <p className="text-sm text-muted">
                      No linked security events.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {securityEvents.map((e) => (
                        <li
                          key={e.linkId}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{e.title}</p>
                            <p className="text-xs text-muted">
                              {e.severity} · {e.ruleId ?? "no rule"}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={
                              isPending || evidencedSeIds.has(e.id)
                            }
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("securityEventId", e.id);
                              runAction(() =>
                                linkEvidenceSecurityEventAction(
                                  incident.id,
                                  fd
                                )
                              );
                            }}
                          >
                            {evidencedSeIds.has(e.id) ? "Linked" : "Link"}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Link Finding Evidence</CardTitle>
                  <CardDescription>
                    From findings already linked to this incident.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {incident.findings.length === 0 ? (
                    <p className="text-sm text-muted">No linked findings.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {incident.findings.map((f) => (
                        <li
                          key={f.linkId}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{f.title}</p>
                            <p className="text-xs text-muted">
                              {f.severity} · {f.status}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={
                              isPending ||
                              evidencedFindingIds.has(f.findingId)
                            }
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("findingId", f.findingId);
                              runAction(() =>
                                linkEvidenceFindingAction(incident.id, fd)
                              );
                            }}
                          >
                            {evidencedFindingIds.has(f.findingId)
                              ? "Linked"
                              : "Link"}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Evidence Log</CardTitle>
            </CardHeader>
            <CardContent>
              {evidence.length === 0 ? (
                <p className="text-sm text-muted">No evidence recorded.</p>
              ) : (
                <ul className="space-y-3">
                  {evidence.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium">
                          <span className="mr-2 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted">
                            {e.type}
                          </span>
                          {e.title}
                        </p>
                        <p className="text-xs text-muted">
                          {formatRelativeTime(e.collectedAt)}
                        </p>
                      </div>
                      {e.description && (
                        <p className="mt-1 text-muted">{e.description}</p>
                      )}
                      <p className="mt-1 text-xs text-muted">
                        {e.collectedByName ?? e.collectedByEmail ?? "System"}
                        {e.url ? (
                          <>
                            {" · "}
                            <a
                              href={e.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-accent hover:underline"
                            >
                              Open link
                            </a>
                          </>
                        ) : null}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "findings" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Linked Findings</CardTitle>
              <CardDescription>
                Findings in the same organization. Prefer same-client matches.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {incident.findings.length === 0 ? (
                <p className="text-sm text-muted">No findings linked.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted">
                      <tr>
                        <th className="py-2 pr-3">Finding</th>
                        <th className="py-2 pr-3">Severity</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Source</th>
                        <th className="py-2 pr-3">Asset</th>
                        <th className="py-2 pr-3">Instances</th>
                        <th className="py-2 pr-3">Last Detected</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {incident.findings.map((f) => (
                        <tr key={f.linkId}>
                          <td className="py-2 pr-3">
                            <Link
                              href={`/vulnerabilities/${f.findingId}`}
                              className="hover:text-accent"
                            >
                              {f.title}
                            </Link>
                          </td>
                          <td className="py-2 pr-3">{f.severity}</td>
                          <td className="py-2 pr-3">{f.status}</td>
                          <td className="py-2 pr-3">{f.source}</td>
                          <td className="py-2 pr-3">{f.assetName ?? "—"}</td>
                          <td className="py-2 pr-3">{f.instanceCount}</td>
                          <td className="py-2 pr-3">
                            {formatRelativeTime(f.lastDetectedAt)}
                          </td>
                          <td className="py-2">
                            {canManage && (
                              <button
                                type="button"
                                className="text-xs text-danger hover:underline"
                                disabled={isPending}
                                onClick={() =>
                                  runAction(() =>
                                    unlinkFindingAction(
                                      incident.id,
                                      f.findingId
                                    )
                                  )
                                }
                              >
                                Unlink
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {incident.remediations.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-foreground">
                    Related Remediation
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {incident.remediations.map((r) => (
                      <li
                        key={r.id}
                        className="rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{r.title}</span>
                        <span className="text-muted">
                          {" "}
                          · {r.status} · {r.priority} · from {r.findingTitle}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Link Finding</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <input
                    value={findingSearch}
                    onChange={(e) => setFindingSearch(e.target.value)}
                    placeholder="Search findings…"
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                  <Button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await searchFindingsForLinkAction({
                          clientId: incident.clientId,
                          search: findingSearch,
                        });
                        if (result.success) setFindingResults(result.data);
                        else setError(result.error);
                      })
                    }
                  >
                    Search
                  </Button>
                </div>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {findingResults.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{f.title}</p>
                        <p className="text-xs text-muted">
                          {f.severity} · {f.status} · {f.assetName ?? "—"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={isPending || linkedFindingIds.has(f.id)}
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("findingId", f.id);
                          runAction(() =>
                            linkFindingAction(incident.id, fd)
                          );
                        }}
                      >
                        {linkedFindingIds.has(f.id) ? "Linked" : "Link"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "security-events" && (
        <Card>
          <CardHeader>
            <CardTitle>Linked Security Events</CardTitle>
            <CardDescription>
              Wazuh-derived events escalated or linked to this incident.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {securityEvents.length === 0 ? (
              <p className="text-sm text-muted">No security events linked.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted">
                    <tr>
                      <th className="py-2 pr-3">Event</th>
                      <th className="py-2 pr-3">Severity</th>
                      <th className="py-2 pr-3">Wazuh Rule</th>
                      <th className="py-2 pr-3">Asset</th>
                      <th className="py-2 pr-3">Occurrences</th>
                      <th className="py-2 pr-3">First Seen</th>
                      <th className="py-2">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {securityEvents.map((e) => (
                      <tr key={e.linkId}>
                        <td className="py-2 pr-3">
                          <Link
                            href={`/security-events/${e.id}`}
                            className="hover:text-accent"
                          >
                            {e.title}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">
                          <SecurityEventSeverityBadge
                            severity={
                              e.severity as import("@prisma/client").SecurityEventSeverity
                            }
                          />
                        </td>
                        <td className="py-2 pr-3">
                          {e.ruleId ?? "—"}
                          {e.ruleDescription
                            ? ` — ${e.ruleDescription}`
                            : ""}
                        </td>
                        <td className="py-2 pr-3">{e.assetName ?? "—"}</td>
                        <td className="py-2 pr-3">{e.occurrenceCount}</td>
                        <td className="py-2 pr-3">
                          {formatDate(e.firstSeenAt)}
                        </td>
                        <td className="py-2">{formatDate(e.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "response" && (
        <div className="space-y-4">
          {(
            [
              ["impactSummary", "Impact Summary", incident.impactSummary],
              ["scopeSummary", "Scope Summary", incident.scopeSummary],
              ["rootCause", "Investigation / Root Cause", incident.rootCause],
              [
                "containmentSummary",
                "Containment",
                incident.containmentSummary,
              ],
              [
                "eradicationSummary",
                "Eradication",
                incident.eradicationSummary,
              ],
              ["recoverySummary", "Recovery", incident.recoverySummary],
              [
                "resolutionSummary",
                "Resolution",
                incident.resolutionSummary,
              ],
              ["businessImpact", "Business Impact", incident.businessImpact],
              [
                "technicalImpact",
                "Technical Impact",
                incident.technicalImpact,
              ],
            ] as const
          ).map(([field, label, value]) => (
            <Card key={field}>
              <CardHeader>
                <CardTitle>{label}</CardTitle>
              </CardHeader>
              <CardContent>
                {!canManage ? (
                  <p className="whitespace-pre-wrap text-sm">
                    {value || "Not documented yet."}
                  </p>
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      runAction(() =>
                        updateIncidentResponseAction(incident.id, fd)
                      );
                    }}
                  >
                    <textarea
                      name={field}
                      defaultValue={value ?? ""}
                      rows={4}
                      maxLength={5000}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      placeholder={`Document ${label.toLowerCase()}…`}
                    />
                    <Button type="submit" disabled={isPending} size="sm">
                      Save {label}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "post-incident" && (
        <div className="space-y-4">
          {(
            [
              ["lessonsLearned", "Lessons Learned", incident.lessonsLearned],
              ["whatWentWell", "What Went Well", incident.whatWentWell],
              [
                "whatCouldImprove",
                "What Could Improve",
                incident.whatCouldImprove,
              ],
              [
                "followUpActions",
                "Follow-up Actions",
                incident.followUpActions,
              ],
            ] as const
          ).map(([field, label, value]) => (
            <Card key={field}>
              <CardHeader>
                <CardTitle>{label}</CardTitle>
              </CardHeader>
              <CardContent>
                {!canManage ? (
                  <p className="whitespace-pre-wrap text-sm">
                    {value || "Not documented yet."}
                  </p>
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      runAction(() =>
                        updateIncidentResponseAction(incident.id, fd)
                      );
                    }}
                  >
                    <textarea
                      name={field}
                      defaultValue={value ?? ""}
                      rows={4}
                      maxLength={5000}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      placeholder={`Document ${label.toLowerCase()}…`}
                    />
                    <Button type="submit" disabled={isPending} size="sm">
                      Save {label}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "notes" && (
        <div className="space-y-4">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Add Note</CardTitle>
                <CardDescription>
                  Notes are immutable after creation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const fd = new FormData(form);
                    runAction(async () => {
                      const result = await addIncidentNoteAction(
                        incident.id,
                        fd
                      );
                      if (result.success) form.reset();
                      return result;
                    });
                  }}
                >
                  <textarea
                    name="content"
                    required
                    rows={3}
                    maxLength={5000}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    placeholder="Analyst note…"
                  />
                  <Button type="submit" disabled={isPending}>
                    Add Note
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {incident.notes.length === 0 ? (
                <p className="text-sm text-muted">No notes yet.</p>
              ) : (
                <ul className="space-y-4">
                  {incident.notes.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-md border border-border px-4 py-3"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">
                          {n.authorName ?? n.authorEmail}
                        </p>
                        <p className="text-xs text-muted">
                          {formatDate(n.createdAt)}
                        </p>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                        {n.content}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
