"use client";

import Link from "next/link";
import {
  createIncidentFromInvestigationAction,
  linkToIncidentAction,
} from "@/app/(dashboard)/investigations/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WorkflowEmptyState } from "@/components/workflow/workflow-empty-state";
import type { TabBaseProps } from "./shared";

export function IncidentsTab({
  investigation,
  canAct,
  closed,
  isPending,
  runAction,
}: TabBaseProps) {
  return (
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
  );
}
