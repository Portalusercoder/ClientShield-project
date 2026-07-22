"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  acknowledgeSecurityEventAction,
  dismissSecurityEventAction,
  escalateSecurityEventAction,
  linkSecurityEventToIncidentAction,
  startSecurityEventReviewAction,
} from "@/app/(dashboard)/security-events/actions";
import {
  SecurityEventClassificationBadge,
  SecurityEventSeverityBadge,
  SecurityEventStatusBadge,
} from "@/components/security-events/security-event-badges";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import type { SecurityEventDetail } from "@/types/security-events";

interface SecurityEventDetailViewProps {
  event: SecurityEventDetail;
  canTriage: boolean;
}

export function SecurityEventDetailView({
  event,
  canTriage,
}: SecurityEventDetailViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDismiss, setShowDismiss] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalateMode, setEscalateMode] = useState<"create" | "link">("create");
  const [showRaw, setShowRaw] = useState(false);

  const run = (
    fn: () => Promise<{
      success: boolean;
      error?: string;
      data?: { incidentId?: string } | void;
    }>
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) setError(result.error ?? "Action failed");
      else if (result.data?.incidentId) {
        router.push(`/incidents/${result.data.incidentId}`);
      } else {
        router.refresh();
      }
    });
  };

  const jsonArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(String);
    return [];
  };

  const mitreTactics = jsonArray(event.mitreTactics);
  const mitreTechniques = jsonArray(event.mitreTechniques);
  const hasMitre = mitreTactics.length > 0 || mitreTechniques.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SecurityEventSeverityBadge severity={event.severity} />
            <SecurityEventClassificationBadge
              classification={event.classification}
            />
            <SecurityEventStatusBadge status={event.status} />
            <span className="rounded border border-border px-2 py-0.5 text-xs text-muted">
              {event.source}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            {event.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {event.summary ?? `Event ID: ${event.id}`}
          </p>
        </div>
        {canTriage && event.status !== "DISMISSED" && (
          <div className="flex flex-wrap gap-2">
            {(event.status === "NEW" || event.status === "ACKNOWLEDGED") && (
              <Button
                disabled={pending}
                onClick={() =>
                  run(() => startSecurityEventReviewAction(event.id))
                }
              >
                {event.status === "ACKNOWLEDGED"
                  ? "Return to Review"
                  : "Start Review"}
              </Button>
            )}
            {["NEW", "REVIEWING"].includes(event.status) && (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(() => acknowledgeSecurityEventAction(event.id))
                }
              >
                Acknowledge
              </Button>
            )}
            {event.status !== "ESCALATED" && (
              <>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setShowDismiss((v) => !v)}
                >
                  Dismiss
                </Button>
                <Button
                  disabled={pending || !event.clientId}
                  onClick={() => setShowEscalate((v) => !v)}
                  title={
                    !event.clientId
                      ? "Map agent to a client/asset before escalation"
                      : undefined
                  }
                >
                  Escalate to Incident
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-severity-critical/30 bg-severity-critical/10 px-4 py-2 text-sm text-severity-critical">
          {error}
        </div>
      )}

      {showDismiss && (
        <Card>
          <CardHeader>
            <CardTitle>Dismiss Event</CardTitle>
            <CardDescription>
              A dismissal reason is required. This does not modify Wazuh alerts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={(fd) =>
                run(async () => dismissSecurityEventAction(event.id, fd))
              }
              className="space-y-3"
            >
              <textarea
                name="reason"
                required
                minLength={3}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Reason for dismissal…"
              />
              <Button type="submit" disabled={pending}>
                Confirm Dismiss
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {showEscalate && (
        <Card>
          <CardHeader>
            <CardTitle>Escalate to Incident</CardTitle>
            <CardDescription>
              Analyst-confirmed escalation only. Confirm context before creating
              or linking an incident.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-border bg-surface-elevated px-3 py-3 text-sm">
              <Row label="Severity" value={event.severity} />
              <Row label="Client" value={event.clientName ?? "Unmapped"} />
              <Row label="Asset" value={event.assetName ?? "—"} />
              <Row
                label="Rule"
                value={
                  event.ruleId
                    ? `${event.ruleId}${event.ruleDescription ? ` — ${event.ruleDescription}` : ""}`
                    : "—"
                }
              />
              <Row
                label="Occurrences"
                value={String(event.occurrenceCount)}
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant={escalateMode === "create" ? "primary" : "secondary"}
                onClick={() => setEscalateMode("create")}
              >
                Create new Incident
              </Button>
              <Button
                type="button"
                variant={escalateMode === "link" ? "primary" : "secondary"}
                onClick={() => setEscalateMode("link")}
                disabled={event.linkableIncidents.length === 0}
              >
                Link to existing
              </Button>
            </div>

            {escalateMode === "create" ? (
              <form
                action={(fd) =>
                  run(async () => escalateSecurityEventAction(event.id, fd))
                }
                className="grid gap-3 md:grid-cols-2"
              >
                <input
                  name="title"
                  defaultValue={`Security Incident: ${event.title}`}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm md:col-span-2"
                />
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={`Escalated from Wazuh security event. Rule ${event.ruleId ?? "n/a"}. Occurrences: ${event.occurrenceCount}.`}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm md:col-span-2"
                />
                <select
                  name="severity"
                  defaultValue={event.severity}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  name="category"
                  defaultValue="SUSPICIOUS_ACTIVITY"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="SUSPICIOUS_ACTIVITY">Suspicious Activity</option>
                  <option value="MALWARE">Malware</option>
                  <option value="UNAUTHORIZED_ACCESS">Unauthorized Access</option>
                  <option value="ACCOUNT_COMPROMISE">Account Compromise</option>
                  <option value="BRUTE_FORCE">Brute Force</option>
                  <option value="POLICY_VIOLATION">Policy Violation</option>
                  <option value="OTHER">Other</option>
                </select>
                <Button type="submit" disabled={pending} className="md:col-span-2">
                  Confirm Create Incident
                </Button>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const incidentId = String(fd.get("incidentId") ?? "");
                  run(async () =>
                    linkSecurityEventToIncidentAction({
                      securityEventId: event.id,
                      incidentId,
                    })
                  );
                }}
                className="space-y-3"
              >
                <select
                  name="incidentId"
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select incident…</option>
                  {event.linkableIncidents.map((inc) => (
                    <option key={inc.id} value={inc.id}>
                      {inc.title} · {inc.status} · {inc.severity}
                    </option>
                  ))}
                </select>
                <Button type="submit" disabled={pending}>
                  Confirm Link
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Event Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Source" value={event.source} />
            <Row label="Severity" value={event.severity} />
            <Row label="Classification" value={event.classification} />
            <Row label="Status" value={event.status} />
            <Row label="Rule ID" value={event.ruleId ?? "—"} />
            <Row label="Rule Level" value={event.ruleLevel?.toString() ?? "—"} />
            <Row
              label="Rule Groups"
              value={
                jsonArray(event.ruleGroups).length
                  ? jsonArray(event.ruleGroups).join(", ")
                  : "—"
              }
            />
            <Row
              label="Detection / Last Seen"
              value={formatDateTime(event.lastSeenAt)}
            />
            <Row
              label="First Seen"
              value={formatDateTime(event.firstSeenAt)}
            />
            <Row
              label="Occurrences"
              value={String(event.occurrenceCount)}
            />
            <Row label="SCA Check" value={event.scaCheckId ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Asset Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Client" value={event.clientName ?? "Unmapped"} />
            <Row label="Asset" value={event.assetName ?? "—"} />
            <Row label="Asset Type" value={event.assetType ?? "—"} />
            <Row label="Environment" value={event.assetEnvironment ?? "—"} />
            <Row label="Criticality" value={event.assetCriticality ?? "—"} />
            <Row
              label="Wazuh Agent"
              value={
                event.agentId
                  ? `${event.agentId}${event.agentName ? ` (${event.agentName})` : ""}`
                  : "—"
              }
            />
            <Row label="Agent Status" value={event.agentStatus ?? "—"} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detection Details</CardTitle>
          <CardDescription>
            Normalized safe fields only. Secrets are never displayed.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          <Row label="Source IP" value={event.sourceIp ?? "—"} />
          <Row label="Destination IP" value={event.destinationIp ?? "—"} />
          <Row
            label="Source Port"
            value={event.sourcePort?.toString() ?? "—"}
          />
          <Row
            label="Destination Port"
            value={event.destinationPort?.toString() ?? "—"}
          />
          <Row label="Protocol" value={event.protocol ?? "—"} />
          <Row label="User" value={event.username ?? "—"} />
          <Row label="Process" value={event.processName ?? "—"} />
          <Row label="File Path" value={event.filePath ?? "—"} />
          <div className="md:col-span-2">
            <Row label="Command" value={event.commandLine ?? "—"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Correlation Details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted">
          <p className="text-foreground">
            {event.correlationSummary ??
              `${event.occurrenceCount} alert${event.occurrenceCount === 1 ? "" : "s"} grouped for this detection.`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MITRE ATT&amp;CK</CardTitle>
          <CardDescription>
            Only mappings provided by the detection source are shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-2">
          {hasMitre ? (
            <>
              <TagList label="Tactics" items={mitreTactics} />
              <TagList label="Techniques" items={mitreTechniques} />
            </>
          ) : (
            <p className="text-muted md:col-span-2">
              No MITRE ATT&amp;CK mapping provided by detection source.
            </p>
          )}
          <TagList label="PCI DSS" items={jsonArray(event.pciDss)} />
          <TagList label="NIST" items={jsonArray(event.nist)} />
          <TagList label="GDPR" items={jsonArray(event.gdpr)} />
          <TagList label="HIPAA" items={jsonArray(event.hipaa)} />
        </CardContent>
      </Card>

      {event.rawDataSanitized != null && (
        <Card>
          <CardHeader>
            <CardTitle>Raw Event (Sanitized)</CardTitle>
            <CardDescription>
              Allowlisted Wazuh fields only. Secrets are redacted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowRaw((v) => !v)}
            >
              {showRaw ? "Hide JSON" : "Show sanitized JSON"}
            </Button>
            {showRaw && (
              <pre className="mt-3 max-h-80 overflow-auto rounded-md border border-border bg-background p-3 text-xs text-muted">
                {JSON.stringify(event.rawDataSanitized, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Activity Timeline</CardTitle>
          <CardDescription>
            Append-only investigation history. Correlation noise is aggregated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {event.activities.length === 0 ? (
            <p className="text-sm text-muted">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {event.activities.map((a) => (
                <li
                  key={a.id}
                  className="rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {a.activityType.replaceAll("_", " ")}
                    </span>
                    <span className="text-xs text-muted">
                      {formatDateTime(a.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-muted">{a.message}</p>
                  {a.note && (
                    <p className="mt-1 text-xs text-foreground">Note: {a.note}</p>
                  )}
                  <p className="mt-1 text-xs text-muted">
                    {a.actorName ?? "System"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {event.linkedIncidents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Related Incidents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {event.linkedIncidents.map((inc) => (
              <Link
                key={inc.linkId}
                href={`/incidents/${inc.incidentId}`}
                className="block rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-elevated"
              >
                {inc.title} · {inc.status} · {inc.severity}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-1.5">
      <span className="text-muted">{label}</span>
      <span className="max-w-[65%] break-words text-right text-foreground">
        {value}
      </span>
    </div>
  );
}

function TagList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-muted">{label}</p>
      {items.length === 0 ? (
        <p className="text-muted">—</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.map((item) => (
            <span
              key={item}
              className="rounded border border-border px-2 py-0.5 text-xs"
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
