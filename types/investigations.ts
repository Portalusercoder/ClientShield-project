import type {
  CorrelationCandidateStatus,
  CorrelationConfidence,
  IncidentSeverity,
  InvestigationCreatedByType,
  InvestigationStatus,
  ObservableType,
  ThreatIntelLookupStatus,
  ThreatIntelRiskLevel,
} from "@prisma/client";

export type InvestigationListItem = {
  id: string;
  title: string;
  status: InvestigationStatus;
  severity: IncidentSeverity;
  createdByType: InvestigationCreatedByType;
  groupingExplanation: string | null;
  eventCount: number;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InvestigationFilters = {
  status?: InvestigationStatus;
  createdByType?: InvestigationCreatedByType;
  page?: number;
  pageSize?: number;
};

export type InvestigationMetrics = {
  open: number;
  investigating: number;
  confirmed: number;
  systemSuggestedOpen: number;
  linkedToIncident: number;
  total: number;
  /** null when threat intel is not configured/enabled (display as N/A). */
  maliciousIndicators: number | null;
};

export type InvestigationEventRow = {
  linkId: string;
  securityEventId: string;
  title: string;
  severity: string;
  status: string;
  agentName: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  addedAt: Date;
};

export type InvestigationObservableRow = {
  id: string;
  type: ObservableType;
  value: string;
  normalizedValue: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  roles: string[];
  safeForExternalLookup: boolean;
  unsafeReason?: string;
};

export type InvestigationThreatIntelRow = {
  id: string;
  observableId: string;
  provider: string;
  status: ThreatIntelLookupStatus;
  riskLevel: ThreatIntelRiskLevel | null;
  confidence: number | null;
  summary: string | null;
  lookedUpAt: Date;
  expiresAt: Date | null;
};

export type InvestigationIncidentRow = {
  linkId: string;
  incidentId: string;
  caseNumber: string;
  title: string;
  status: string;
  severity: string;
};

export type InvestigationActivityRow = {
  id: string;
  activityType: string;
  message: string;
  note: string | null;
  createdAt: Date;
  actorUserId: string | null;
};

export type InvestigationCandidateRow = {
  id: string;
  eventAId: string;
  eventBId: string;
  score: number;
  confidence: CorrelationConfidence;
  reasons: string[];
  status: CorrelationCandidateStatus;
};

export type InvestigationLinkableIncident = {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
  severity: string;
};

export type InvestigationDetailViewModel = {
  id: string;
  title: string;
  summary: string | null;
  status: InvestigationStatus;
  severity: IncidentSeverity;
  createdByType: InvestigationCreatedByType;
  groupingExplanation: string | null;
  mitreTactics: string[];
  mitreTechniques: string[];
  confirmedAt: Date | null;
  dismissedAt: Date | null;
  dismissReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  eventCount: number;
  observableCount: number;
  incidentCount: number;
  events: InvestigationEventRow[];
  observables: InvestigationObservableRow[];
  threatIntelLookups: InvestigationThreatIntelRow[];
  incidents: InvestigationIncidentRow[];
  activities: InvestigationActivityRow[];
  candidates: InvestigationCandidateRow[];
  linkableIncidents: InvestigationLinkableIncident[];
  threatIntelEnabled: boolean;
  threatIntelConfigured: boolean;
};

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export type CorrelationScoreResult = {
  score: number;
  confidence: CorrelationConfidence | null;
  reasons: string[];
  signalCount: number;
  hasHashSignal: boolean;
  hasAssetAndTime: boolean;
};

export type ThreatIntelLookupResult = {
  id: string;
  observableId: string;
  provider: string;
  status: ThreatIntelLookupStatus;
  riskLevel: ThreatIntelRiskLevel | null;
  confidence: number | null;
  summary: string | null;
  lookedUpAt: Date;
  expiresAt: Date | null;
  cached: boolean;
};

export type ObservableUpsertInput = {
  organizationId: string;
  type: ObservableType;
  value: string;
  normalizedValue: string;
};

export type CreateInvestigationInput = {
  title: string;
  summary?: string | null;
  severity?: IncidentSeverity;
  securityEventIds: string[];
  groupingExplanation?: string | null;
};

export type CorrelationCandidateView = {
  id: string;
  eventAId: string;
  eventBId: string;
  score: number;
  confidence: CorrelationConfidence;
  reasons: string[];
  status: CorrelationCandidateStatus;
};
