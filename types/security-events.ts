import type {
  SecurityEventClassification,
  SecurityEventSeverity,
  SecurityEventStatus,
} from "@prisma/client";

export interface SecurityEventSummaryCounts {
  newEvents: number;
  critical: number;
  high: number;
  unmapped: number;
  escalated: number;
}

export interface SecurityEventSocMetrics {
  last24hTotal: number;
  actionable: number;
  underReview: number;
  escalated: number;
  criticalHigh: number;
  noisyOrFiltered: number;
  informational: number;
  ignored: number;
  topRules: { ruleId: string; title: string; count: number }[];
  topAssets: { assetId: string | null; assetName: string; count: number }[];
  severityDistribution: { severity: SecurityEventSeverity; count: number }[];
}

export interface SecurityEventListItem {
  id: string;
  title: string;
  severity: SecurityEventSeverity;
  status: SecurityEventStatus;
  classification: SecurityEventClassification;
  source: string;
  ruleId: string | null;
  ruleLevel: number | null;
  ruleDescription: string | null;
  clientId: string | null;
  clientName: string | null;
  assetId: string | null;
  assetName: string | null;
  agentId: string | null;
  agentName: string | null;
  occurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface SecurityEventListResult {
  events: SecurityEventListItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: SecurityEventSummaryCounts;
  clients: { id: string; name: string }[];
  assets: { id: string; name: string; clientId: string }[];
}

export interface SecurityEventLinkedIncident {
  linkId: string;
  incidentId: string;
  title: string;
  status: string;
  severity: string;
}

export interface SecurityEventActivityItem {
  id: string;
  activityType: string;
  message: string;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
  actorName: string | null;
}

export interface SecurityEventDetail {
  id: string;
  title: string;
  summary: string | null;
  severity: SecurityEventSeverity;
  status: SecurityEventStatus;
  classification: SecurityEventClassification;
  source: string;
  externalEventId: string | null;
  ruleId: string | null;
  ruleLevel: number | null;
  ruleDescription: string | null;
  ruleGroups: unknown;
  agentId: string | null;
  agentName: string | null;
  agentStatus: string | null;
  clientId: string | null;
  clientName: string | null;
  assetId: string | null;
  assetName: string | null;
  assetType: string | null;
  assetEnvironment: string | null;
  assetCriticality: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  occurrenceCount: number;
  correlationSummary: string | null;
  scaCheckId: string | null;
  sourceIp: string | null;
  destinationIp: string | null;
  sourcePort: number | null;
  destinationPort: number | null;
  protocol: string | null;
  username: string | null;
  processName: string | null;
  filePath: string | null;
  commandLine: string | null;
  mitreTactics: unknown;
  mitreTechniques: unknown;
  pciDss: unknown;
  gdpr: unknown;
  hipaa: unknown;
  nist: unknown;
  rawDataSanitized: unknown;
  reviewedAt: Date | null;
  reviewedByName: string | null;
  acknowledgedAt: Date | null;
  dismissedAt: Date | null;
  dismissedByName: string | null;
  dismissalReason: string | null;
  linkedIncidents: SecurityEventLinkedIncident[];
  activities: SecurityEventActivityItem[];
  linkableIncidents: { id: string; title: string; status: string; severity: string }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardSecurityEvent {
  id: string;
  title: string;
  severity: SecurityEventSeverity;
  status: SecurityEventStatus;
  clientName: string;
  occurrenceCount: number;
  lastSeenAt: Date;
}

export interface WazuhIntegrationStatus {
  enabled: boolean;
  configuredOrganizationId: string | null;
  organizationMatches: boolean;
  indexerConnected: boolean;
  managerConnected: boolean;
  indexerStatus?: string;
  /** True when an ingestion checkpoint has been set. */
  checkpointInitialized: boolean;
  /** Cursor timestamp — only alerts strictly newer are eligible for sync. */
  checkpointTimestamp: string | null;
  lastSuccessfulSyncAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  autoSyncEnabled: boolean;
  syncIntervalSeconds: number;
  minEventLevel: number;
  workerStatus: "running" | "stale" | "not_detected";
  workerId: string | null;
  workerLastHeartbeatAt: string | null;
  lastSyncDurationMs: number | null;
  lastSyncProcessed: number | null;
  lastSyncCreated: number | null;
  lastSyncUpdated: number | null;
  lastSyncFiltered: number | null;
  lastSyncIgnored: number | null;
  lastSyncSkippedDuplicates: number | null;
  lastSyncErrors: number | null;
  /** Computed from ledger when available (last 24h). */
  processedLast24h: number;
  createdLast24h: number;
  correlatedLast24h: number;
  filteredLast24h: number;
  ignoredLast24h: number;
  nextExpectedSyncAt: string | null;
}

export interface WazuhAgentListItem {
  id: string;
  name: string;
  status: string;
  ip: string | null;
  os: string | null;
  version: string | null;
  lastKeepAlive: string | null;
  mappedClientId: string | null;
  mappedClientName: string | null;
  mappedAssetId: string | null;
  mappedAssetName: string | null;
  mappingId: string | null;
  mappingStatus?: string | null;
  enrollmentStatus?: string | null;
  inventoryRole?:
    | "MANAGER"
    | "MAPPED_ENDPOINT"
    | "UNMAPPED_ENDPOINT"
    | "DISCONNECTED_ENDPOINT";
  mappable?: boolean;
}
