"use client";

import {
  assignIncidentAction,
  setCommanderAction,
  setLeadAnalystAction,
  updateIncidentSeverityAction,
} from "@/app/(dashboard)/incidents/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { IncidentDetail } from "@/types/incidents";
import {
  Field,
  formatDuration,
  type CandidateUser,
} from "@/components/incidents/detail/shared";

interface IncidentOverviewTabProps {
  incident: IncidentDetail;
  canManage: boolean;
  canCommand: boolean;
  isPending: boolean;
  leadCandidates: CandidateUser[];
  commanderCandidates: CandidateUser[];
  runAction: (fn: () => Promise<{ success: boolean; error?: string }>) => void;
}

export function IncidentOverviewTab({
  incident,
  canManage,
  canCommand,
  isPending,
  leadCandidates,
  commanderCandidates,
  runAction,
}: IncidentOverviewTabProps) {
  return (
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

          <div className="mt-6 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Contractual SLA
            </p>
            {incident.contractualSla.overallState === "NO_POLICY" ||
            !incident.contractualSla.snapshot ? (
              <p className="mt-2 text-sm text-muted">
                No SLA policy configured
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Overall status"
                    value={incident.contractualSla.overallState}
                  />
                  <Field
                    label="Snapshot source"
                    value={
                      incident.contractualSla.snapshot.snapshotSource ===
                      "CLIENT_OVERRIDE"
                        ? "Client Override"
                        : "Organization Default"
                    }
                  />
                  <Field
                    label="Severity at snapshot"
                    value={
                      incident.contractualSla.snapshot.severityAtSnapshot
                    }
                  />
                  <Field
                    label="Approaching threshold"
                    value={`${incident.contractualSla.snapshot.approachingThresholdPct}%`}
                  />
                  <Field
                    label="Snapshot taken"
                    value={formatDate(
                      incident.contractualSla.snapshot.snappedAt
                    )}
                  />
                  <Field
                    label="Snapshot generation"
                    value={String(
                      incident.contractualSla.snapshot.generation
                    )}
                  />
                </dl>
                <ul className="space-y-2 text-sm">
                  {incident.contractualSla.metrics
                    .filter((m) => m.targetMinutes != null)
                    .map((m) => (
                      <li
                        key={m.metric}
                        className="rounded-md border border-border px-3 py-2"
                      >
                        <span className="font-medium text-foreground">
                          {m.metric}
                        </span>
                        <span className="text-muted">
                          {" "}
                          · {m.state}
                          {m.targetMinutes != null
                            ? ` · target ${m.targetMinutes}m`
                            : ""}
                          {m.elapsedMinutes != null
                            ? ` · elapsed ${Math.round(m.elapsedMinutes)}m`
                            : ""}
                          {!m.isCompleted && m.remainingMinutes != null
                            ? ` · remaining ${Math.round(m.remainingMinutes)}m`
                            : ""}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
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
  );
}
