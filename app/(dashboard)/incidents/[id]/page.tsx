import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IncidentDetailView } from "@/components/incidents/incident-detail-view";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { listEvidence } from "@/services/incidents/evidence.service";
import {
  listCommanderCandidates,
  listLeadCandidates,
} from "@/services/incidents/ownership.service";
import {
  ensureSystemPlaybooksExist,
  listPlaybookInstances,
  listPlaybooks,
  suggestPlaybook,
} from "@/services/incidents/playbook.service";
import { listResponseTasks } from "@/services/incidents/response-task.service";
import { getIncidentById } from "@/services/incidents.service";
import type { EvidenceItem, ResponseTaskItem } from "@/types/incident-case";

export const dynamic = "force-dynamic";

interface IncidentDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: IncidentDetailPageProps): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const incident = await getIncidentById(session.organizationId, id);
  return {
    title: incident
      ? `${incident.caseNumber} · ${incident.title}`
      : "Incident",
  };
}

export default async function IncidentDetailPage({
  params,
}: IncidentDetailPageProps) {
  const session = await requireSession();
  const { id } = await params;

  await ensureSystemPlaybooksExist();

  const [
    incident,
    securityEvents,
    playbooks,
    suggestion,
    playbookInstances,
    tasksRaw,
    evidenceRaw,
    leadCandidates,
    commanderCandidates,
  ] = await Promise.all([
    getIncidentById(session.organizationId, id),
    (
      await import("@/services/security-events.service")
    ).listSecurityEventsForIncident(session.organizationId, id),
    listPlaybooks(session.organizationId),
    suggestPlaybook(session.organizationId, id).catch(() => null),
    listPlaybookInstances(session.organizationId, id).catch(() => []),
    listResponseTasks(session.organizationId, id),
    listEvidence(session.organizationId, id),
    listLeadCandidates(session.organizationId),
    listCommanderCandidates(session.organizationId),
  ]);

  if (!incident) notFound();

  const tasks: ResponseTaskItem[] = tasksRaw.map((t) => ({
    id: t.id,
    incidentId: t.incidentId,
    playbookInstanceId: t.playbookInstanceId,
    phase: t.phase,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: t.status,
    isRequired: t.isRequired,
    assignedToUserId: t.assignedToUserId,
    assignedToName: t.assignedTo?.name ?? null,
    assignedToEmail: t.assignedTo?.email ?? null,
    dueAt: t.dueAt,
    completedAt: t.completedAt,
    completedByUserId: t.completedByUserId,
    completedByName: t.completedBy?.name ?? null,
    completionNote: t.completionNote,
    blockedReason: t.blockedReason,
    skipReason: t.skipReason,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));

  const evidence: EvidenceItem[] = evidenceRaw.map((e) => ({
    id: e.id,
    incidentId: e.incidentId,
    type: e.type,
    title: e.title,
    description: e.description,
    sourceType: e.sourceType,
    sourceReferenceId: e.sourceReferenceId,
    url: e.url,
    sha256: e.sha256,
    collectedAt: e.collectedAt,
    collectedByUserId: e.collectedByUserId,
    collectedByName: e.collectedBy?.name ?? null,
    collectedByEmail: e.collectedBy?.email ?? null,
    createdAt: e.createdAt,
  }));

  const instances = playbookInstances.map((inst) => ({
    id: inst.id,
    playbookName: inst.playbookName,
    sourcePlaybookId: inst.sourcePlaybookId,
    assignedAt: inst.assignedAt,
    assignedByName: inst.assignedBy?.name ?? inst.assignedBy?.email ?? null,
    taskCount: inst._count.tasks,
  }));

  return (
    <IncidentDetailView
      incident={incident}
      securityEvents={securityEvents}
      playbooks={playbooks}
      suggestion={suggestion}
      playbookInstances={instances}
      tasks={tasks}
      evidence={evidence}
      leadCandidates={leadCandidates}
      commanderCandidates={commanderCandidates}
      canManage={hasMinimumRole(session, "ANALYST")}
      canClose={hasMinimumRole(session, "ADMIN")}
      canCommand={hasMinimumRole(session, "ADMIN")}
    />
  );
}
