"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  confirmInvestigationAction,
  resolveInvestigationAction,
  startInvestigationAction,
  transitionInvestigationStatusAction,
} from "@/app/(dashboard)/investigations/actions";
import {
  InvestigationCreatedByBadge,
  InvestigationSeverityBadge,
  InvestigationStatusBadge,
} from "@/components/investigations/investigation-badges";
import { EventsTab } from "@/components/investigations/detail/events-tab";
import { FindingsTab } from "@/components/investigations/detail/findings-tab";
import { IncidentsTab } from "@/components/investigations/detail/incidents-tab";
import { MitreTab } from "@/components/investigations/detail/mitre-tab";
import { NotesTab } from "@/components/investigations/detail/notes-tab";
import { ObservablesTab } from "@/components/investigations/detail/observables-tab";
import { OverviewTab } from "@/components/investigations/detail/overview-tab";
import { userLabel, type Tab } from "@/components/investigations/detail/shared";
import { ThreatIntelTab } from "@/components/investigations/detail/threat-intel-tab";
import { TimelineTab } from "@/components/investigations/detail/timeline-tab";
import { PageBreadcrumbs } from "@/components/workflow/page-breadcrumbs";
import { RelatedObjectsPanel } from "@/components/workflow/related-objects-panel";
import { WorkflowQuickActions } from "@/components/workflow/workflow-quick-actions";
import { WorkflowTrail } from "@/components/workflow/workflow-trail";
import { Button } from "@/components/ui/button";
import { buildWorkflowStages } from "@/lib/workflow/workflow-context";
import type { InvestigationDetailViewModel } from "@/types/investigations";

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
        <OverviewTab
          investigation={investigation}
          canAct={canAct}
          closed={closed}
          canReopen={canReopen}
          isPending={isPending}
          runAction={runAction}
          assignmentHistory={assignmentHistory}
        />
      )}

      {tab === "events" && (
        <EventsTab
          investigation={investigation}
          canAct={canAct}
          closed={closed}
          isPending={isPending}
          runAction={runAction}
        />
      )}

      {tab === "observables" && (
        <ObservablesTab
          investigation={investigation}
          canAct={canAct}
          closed={closed}
          isPending={isPending}
          runAction={runAction}
        />
      )}

      {tab === "mitre" && <MitreTab investigation={investigation} />}

      {tab === "notes" && (
        <NotesTab
          investigation={investigation}
          canAct={canAct}
          closed={closed}
          isPending={isPending}
          runAction={runAction}
        />
      )}

      {tab === "timeline" && <TimelineTab investigation={investigation} />}

      {tab === "threat-intel" && (
        <ThreatIntelTab investigation={investigation} />
      )}

      {tab === "findings" && (
        <FindingsTab
          investigation={investigation}
          canAct={canAct}
          closed={closed}
          isPending={isPending}
          runAction={runAction}
          router={router}
        />
      )}

      {tab === "incidents" && (
        <IncidentsTab
          investigation={investigation}
          canAct={canAct}
          closed={closed}
          isPending={isPending}
          runAction={runAction}
        />
      )}
    </div>
  );
}
