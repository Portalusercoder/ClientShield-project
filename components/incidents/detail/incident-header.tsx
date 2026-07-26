"use client";

import {
  IncidentSeverityBadge,
  IncidentStatusBadge,
} from "@/components/incidents/incident-badges";
import { PageBreadcrumbs } from "@/components/workflow/page-breadcrumbs";
import { RelatedObjectsPanel } from "@/components/workflow/related-objects-panel";
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
import type {
  WorkflowQuickAction,
  WorkflowRelatedObject,
  WorkflowStage,
} from "@/lib/workflow/workflow-context";
import { INCIDENT_STATUS_ACTIONS } from "@/services/incidents/status-transitions";
import type { IncidentDetail } from "@/types/incidents";
import type { IncidentStatus } from "@prisma/client";
import { PhaseStepper, type Tab } from "@/components/incidents/detail/shared";

interface IncidentHeaderProps {
  incident: IncidentDetail;
  canManage: boolean;
  canClose: boolean;
  isPending: boolean;
  workflowStages: WorkflowStage[];
  relatedObjects: WorkflowRelatedObject[];
  quickActions: WorkflowQuickAction[];
  tabs: { id: Tab; label: string }[];
  tab: Tab;
  setTab: (tab: Tab) => void;
  downloadPdf: () => void;
  transitionTo: (
    status: IncidentStatus,
    extras?: { reason?: string; closingNote?: string }
  ) => void;
  showCloseForm: boolean;
  setShowCloseForm: (v: boolean) => void;
  closeNote: string;
  setCloseNote: (v: string) => void;
  showReopenForm: boolean;
  setShowReopenForm: (v: boolean) => void;
  reopenReason: string;
  setReopenReason: (v: string) => void;
  error: string | null;
  message: string | null;
}

export function IncidentHeader({
  incident,
  canManage,
  canClose,
  isPending,
  workflowStages,
  relatedObjects,
  quickActions,
  tabs,
  tab,
  setTab,
  downloadPdf,
  transitionTo,
  showCloseForm,
  setShowCloseForm,
  closeNote,
  setCloseNote,
  showReopenForm,
  setShowReopenForm,
  reopenReason,
  setReopenReason,
  error,
  message,
}: IncidentHeaderProps) {
  const primary = INCIDENT_STATUS_ACTIONS[incident.status];

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <PageBreadcrumbs
            items={[
              { label: "Incidents", href: "/incidents" },
              { label: incident.caseNumber },
            ]}
          />
          <WorkflowTrail stages={workflowStages} />
          <p className="font-mono text-sm font-semibold tracking-wide text-accent">
            {incident.caseNumber}
          </p>
          <h1 className="text-2xl font-semibold text-foreground">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <RelatedObjectsPanel
          title="Related objects"
          objects={relatedObjects}
          emptyTitle="No linked Security Events or Findings"
          emptyDescription="Link evidence from the Security Events and Findings tabs to complete the workflow trail."
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
    </>
  );
}
