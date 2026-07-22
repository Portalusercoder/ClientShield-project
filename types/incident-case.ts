import type {
  EvidenceType,
  IncidentActivityType,
  IncidentCategory,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  PlaybookPhase,
  ResponseTaskPriority,
  ResponseTaskStatus,
} from "@prisma/client";

export interface PlaybookListItem {
  id: string;
  name: string;
  description: string | null;
  category: IncidentCategory | null;
  severity: IncidentSeverity | null;
  isActive: boolean;
  isSystemTemplate: boolean;
  organizationId: string | null;
  stepCount: number;
}

export interface PlaybookStepItem {
  id: string;
  order: number;
  phase: PlaybookPhase;
  title: string;
  description: string | null;
  isRequired: boolean;
  defaultPriority: ResponseTaskPriority;
}

export interface PlaybookDetail extends PlaybookListItem {
  steps: PlaybookStepItem[];
}

export interface PlaybookSuggestion {
  playbookId: string;
  name: string;
  playbookName: string;
  reason: string;
  label?: "Suggested";
}

export interface ResponseTaskItem {
  id: string;
  incidentId: string;
  playbookInstanceId: string | null;
  phase: PlaybookPhase;
  title: string;
  description: string | null;
  priority: ResponseTaskPriority;
  status: ResponseTaskStatus;
  isRequired: boolean;
  assignedToUserId: string | null;
  assignedToName: string | null;
  assignedToEmail: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  completedByUserId: string | null;
  completedByName: string | null;
  completionNote: string | null;
  blockedReason: string | null;
  skipReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EvidenceItem {
  id: string;
  incidentId: string;
  type: EvidenceType;
  title: string;
  description: string | null;
  sourceType: string | null;
  sourceReferenceId: string | null;
  url: string | null;
  sha256: string | null;
  collectedAt: Date;
  collectedByUserId: string | null;
  collectedByName: string | null;
  collectedByEmail: string | null;
  createdAt: Date;
}

export interface CaseTimelineItem {
  id: string;
  activityType: IncidentActivityType | string;
  message: string;
  metadata?: unknown;
  createdAt: Date;
  actorName: string | null;
  actorEmail?: string | null;
}

export type CaseTimelineEntry = CaseTimelineItem;

export interface IncidentCaseMetrics {
  openCases: number;
  criticalHighOpen: number;
  investigating: number;
  containment: number;
  recovery: number;
  overdueTasks: number;
  meanTimeToAcknowledgeMs: number | null;
  meanTimeToContainMs: number | null;
  meanTimeToResolveMs: number | null;
}

/** Map lifecycle status to display phase label */
export function statusToPhaseLabel(status: IncidentStatus): string {
  switch (status) {
    case "OPEN":
      return "Open";
    case "ACKNOWLEDGED":
      return "Triage";
    case "INVESTIGATING":
      return "Investigation";
    case "CONTAINED":
      return "Containment";
    case "ERADICATED":
      return "Eradication";
    case "RECOVERING":
      return "Recovery";
    case "RESOLVED":
      return "Resolved";
    case "CLOSED":
      return "Closed";
    default:
      return status;
  }
}

export function suggestPlaybookLabel(source: IncidentSource): string {
  if (source === "WAZUH") return "Endpoint-oriented";
  if (
    source === "FINDING" ||
    source === "OWASP_ZAP" ||
    source === "PASSIVE_CHECK"
  ) {
    return "Web / finding-oriented";
  }
  return "General";
}
