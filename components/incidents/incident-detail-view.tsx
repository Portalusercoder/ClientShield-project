"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  generateIncidentCasePdfAction,
  updateIncidentStatusAction,
} from "@/app/(dashboard)/incidents/actions";
import { buildWorkflowStages } from "@/lib/workflow/workflow-context";
import type {
  EvidenceItem,
  PlaybookListItem,
  PlaybookSuggestion,
  ResponseTaskItem,
} from "@/types/incident-case";
import type { IncidentDetail } from "@/types/incidents";
import type { IncidentStatus } from "@prisma/client";
import {
  IncidentHeader,
} from "@/components/incidents/detail/incident-header";
import { IncidentOverviewTab } from "@/components/incidents/detail/incident-overview-tab";
import { IncidentTimelineTab } from "@/components/incidents/detail/incident-timeline-tab";
import { IncidentPlaybookTab } from "@/components/incidents/detail/incident-playbook-tab";
import { IncidentTasksTab } from "@/components/incidents/detail/incident-tasks-tab";
import type { TaskReasons } from "@/components/incidents/detail/incident-tasks-tab";
import { IncidentEvidenceTab } from "@/components/incidents/detail/incident-evidence-tab";
import { IncidentFindingsTab } from "@/components/incidents/detail/incident-findings-tab";
import { IncidentSecurityEventsTab } from "@/components/incidents/detail/incident-security-events-tab";
import { IncidentResponseTab } from "@/components/incidents/detail/incident-response-tab";
import { IncidentPostIncidentTab } from "@/components/incidents/detail/incident-post-incident-tab";
import { IncidentNotesTab } from "@/components/incidents/detail/incident-notes-tab";
import type {
  CandidateUser,
  LinkedSecurityEventRow,
  PlaybookInstanceRow,
  Tab,
} from "@/components/incidents/detail/shared";

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
  const [taskReasons, setTaskReasons] = useState<TaskReasons>({});
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

  const primarySe = securityEvents[0] ?? null;
  const primaryFinding = incident.findings[0] ?? null;
  const workflowStages = useMemo(
    () =>
      buildWorkflowStages({
        current: "incident",
        securityEvent: primarySe
          ? { id: primarySe.id, title: primarySe.title }
          : null,
        finding: primaryFinding
          ? {
              id: primaryFinding.findingId,
              title: primaryFinding.title,
            }
          : null,
        incident: { id: incident.id, title: incident.title },
      }),
    [incident.id, incident.title, primarySe, primaryFinding]
  );

  const relatedObjects = useMemo(() => {
    const items: {
      id: string;
      kind: "security-event" | "finding" | "asset";
      label: string;
      href: string;
      meta?: string;
    }[] = [];
    if (incident.assetId && incident.assetName) {
      items.push({
        id: incident.assetId,
        kind: "asset",
        label: incident.assetName,
        href: `/assets/${incident.assetId}`,
        meta: "Asset",
      });
    }
    for (const e of securityEvents.slice(0, 5)) {
      items.push({
        id: e.id,
        kind: "security-event",
        label: e.title,
        href: `/security-events/${e.id}`,
        meta: e.status,
      });
    }
    for (const f of incident.findings.slice(0, 5)) {
      items.push({
        id: f.findingId,
        kind: "finding",
        label: f.title,
        href: `/vulnerabilities/${f.findingId}`,
        meta: f.status,
      });
    }
    return items;
  }, [incident, securityEvents]);

  const quickActions = useMemo(() => {
    const actions: {
      id: string;
      label: string;
      href: string;
      available: boolean;
    }[] = [];
    if (primarySe) {
      actions.push({
        id: "open-se",
        label: "Open Security Event",
        href: `/security-events/${primarySe.id}`,
        available: true,
      });
    }
    if (primaryFinding) {
      actions.push({
        id: "open-finding",
        label: "Open Finding",
        href: `/vulnerabilities/${primaryFinding.findingId}`,
        available: true,
      });
    }
    if (incident.assetId) {
      actions.push({
        id: "open-asset",
        label: "Open Asset",
        href: `/assets/${incident.assetId}`,
        available: true,
      });
    }
    return actions;
  }, [primarySe, primaryFinding, incident.assetId]);

  return (
    <div className="space-y-6">
      <IncidentHeader
        incident={incident}
        canManage={canManage}
        canClose={canClose}
        isPending={isPending}
        workflowStages={workflowStages}
        relatedObjects={relatedObjects}
        quickActions={quickActions}
        tabs={tabs}
        tab={tab}
        setTab={setTab}
        downloadPdf={downloadPdf}
        transitionTo={transitionTo}
        showCloseForm={showCloseForm}
        setShowCloseForm={setShowCloseForm}
        closeNote={closeNote}
        setCloseNote={setCloseNote}
        showReopenForm={showReopenForm}
        setShowReopenForm={setShowReopenForm}
        reopenReason={reopenReason}
        setReopenReason={setReopenReason}
        error={error}
        message={message}
      />

      {tab === "overview" && (
        <IncidentOverviewTab
          incident={incident}
          canManage={canManage}
          canCommand={canCommand}
          isPending={isPending}
          leadCandidates={leadCandidates}
          commanderCandidates={commanderCandidates}
          runAction={runAction}
        />
      )}

      {tab === "timeline" && <IncidentTimelineTab incident={incident} />}

      {tab === "playbook" && (
        <IncidentPlaybookTab
          incidentId={incident.id}
          playbooks={playbooks}
          suggestion={suggestion}
          playbookInstances={playbookInstances}
          canManage={canManage}
          isPending={isPending}
          confirmPlaybookId={confirmPlaybookId}
          setConfirmPlaybookId={setConfirmPlaybookId}
          runAction={runAction}
        />
      )}

      {tab === "tasks" && (
        <IncidentTasksTab
          incident={incident}
          tasks={tasks}
          canManage={canManage}
          isPending={isPending}
          taskReasons={taskReasons}
          setTaskReasons={setTaskReasons}
          setError={setError}
          runAction={runAction}
        />
      )}

      {tab === "evidence" && (
        <IncidentEvidenceTab
          incident={incident}
          securityEvents={securityEvents}
          evidence={evidence}
          canManage={canManage}
          isPending={isPending}
          evidencedSeIds={evidencedSeIds}
          evidencedFindingIds={evidencedFindingIds}
          runAction={runAction}
        />
      )}

      {tab === "findings" && (
        <IncidentFindingsTab
          incident={incident}
          canManage={canManage}
          isPending={isPending}
          findingSearch={findingSearch}
          setFindingSearch={setFindingSearch}
          findingResults={findingResults}
          setFindingResults={setFindingResults}
          linkedFindingIds={linkedFindingIds}
          startTransition={startTransition}
          setError={setError}
          runAction={runAction}
        />
      )}

      {tab === "security-events" && (
        <IncidentSecurityEventsTab securityEvents={securityEvents} />
      )}

      {tab === "response" && (
        <IncidentResponseTab
          incident={incident}
          canManage={canManage}
          isPending={isPending}
          runAction={runAction}
        />
      )}

      {tab === "post-incident" && (
        <IncidentPostIncidentTab
          incident={incident}
          canManage={canManage}
          isPending={isPending}
          runAction={runAction}
        />
      )}

      {tab === "notes" && (
        <IncidentNotesTab
          incident={incident}
          canManage={canManage}
          isPending={isPending}
          runAction={runAction}
        />
      )}
    </div>
  );
}
