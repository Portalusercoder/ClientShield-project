import type {
  IncidentActivityType,
  IncidentCategory,
  IncidentDetectionMethod,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
} from "@prisma/client";

export interface IncidentListItem {
  id: string;
  caseNumber: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  currentPhase: string;
  category: IncidentCategory;
  source: IncidentSource;
  clientId: string;
  clientName: string;
  assetId: string | null;
  assetName: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  leadAnalystUserId: string | null;
  leadAnalystName: string | null;
  detectedAt: Date;
  updatedAt: Date;
}

export interface IncidentSummaryCounts {
  criticalOpen: number;
  highOpen: number;
  investigating: number;
  contained: number;
  resolvedThisMonth: number;
  unassigned: number;
}

export interface IncidentListResult {
  incidents: IncidentListItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: IncidentSummaryCounts;
  clients: { id: string; name: string }[];
  assets: { id: string; name: string; clientId: string }[];
  users: { id: string; name: string | null; email: string }[];
}

export interface IncidentSlaMetrics {
  timeToAcknowledgeMs: number | null;
  timeToContainMs: number | null;
  timeToResolveMs: number | null;
}

export interface IncidentLinkedFinding {
  linkId: string;
  findingId: string;
  title: string;
  severity: string;
  status: string;
  source: string;
  assetName: string | null;
  instanceCount: number;
  lastDetectedAt: Date;
}

export interface IncidentRelatedRemediation {
  id: string;
  title: string;
  status: string;
  priority: string;
  findingId: string;
  findingTitle: string;
}

export interface IncidentActivityItem {
  id: string;
  activityType: IncidentActivityType;
  message: string;
  metadata: unknown;
  createdAt: Date;
  actorName: string | null;
  actorEmail: string | null;
}

export interface IncidentNoteItem {
  id: string;
  content: string;
  createdAt: Date;
  authorName: string | null;
  authorEmail: string;
}

export interface IncidentDetail {
  id: string;
  caseNumber: string;
  title: string;
  description: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  currentPhase: string;
  category: IncidentCategory;
  source: IncidentSource;
  externalSourceId: string | null;
  detectionMethod: IncidentDetectionMethod;
  clientId: string;
  clientName: string;
  assetId: string | null;
  assetName: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  assignedToEmail: string | null;
  leadAnalystUserId: string | null;
  leadAnalystName: string | null;
  leadAnalystEmail: string | null;
  commanderUserId: string | null;
  commanderName: string | null;
  commanderEmail: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  occurredAt: Date | null;
  detectedAt: Date;
  reportedAt: Date;
  declaredAt: Date | null;
  acknowledgedAt: Date | null;
  investigationStartedAt: Date | null;
  containedAt: Date | null;
  eradicatedAt: Date | null;
  recoveringAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  businessImpact: string | null;
  technicalImpact: string | null;
  impactSummary: string | null;
  scopeSummary: string | null;
  rootCause: string | null;
  containmentSummary: string | null;
  eradicationSummary: string | null;
  recoverySummary: string | null;
  resolutionSummary: string | null;
  lessonsLearned: string | null;
  whatWentWell: string | null;
  whatCouldImprove: string | null;
  followUpActions: string | null;
  createdAt: Date;
  updatedAt: Date;
  sla: IncidentSlaMetrics;
  findings: IncidentLinkedFinding[];
  remediations: IncidentRelatedRemediation[];
  activities: IncidentActivityItem[];
  notes: IncidentNoteItem[];
  allowedTransitions: IncidentStatus[];
  users: { id: string; name: string | null; email: string }[];
}

export interface DashboardIncident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  clientName: string;
  detectedAt: Date;
  assignedToName: string | null;
}

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };
