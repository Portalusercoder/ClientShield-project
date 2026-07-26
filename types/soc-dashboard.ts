/**
 * SOC Analyst Dashboard DTOs (Phase 6C1).
 * Aggregated read models only — no schema changes.
 */
import type {
  FindingSeverity,
  FindingStatus,
  IncidentSeverity,
  IncidentStatus,
  InvestigationStatus,
  SecurityEventSeverity,
  SecurityEventStatus,
} from "@prisma/client";
import type { HealthCheckResult } from "@/services/health.service";
import type { NotificationInboxItem } from "@/types/notifications";
import type { SlaState } from "@/types/sla";

export type DashboardSeverity =
  | IncidentSeverity
  | FindingSeverity
  | SecurityEventSeverity
  | "NONE";

export interface MyWorkCard {
  key: "investigations" | "incidents" | "findings" | "attention";
  label: string;
  count: number;
  highestSeverity: DashboardSeverity;
  /** Age of oldest item in milliseconds; null when count is 0 */
  oldestAgeMs: number | null;
  href: string;
}

export interface SlaOverviewMetrics {
  atRisk: number;
  breached: number;
  withinSla: number;
  upcomingEscalations: number;
  /** True when org has enabled SLA policies */
  hasSlaPolicies: boolean;
}

export interface SecurityEventsDashboardSection {
  newToday: number;
  untriaged: number;
  escalated: number;
  convertedToInvestigations: number;
  recent: SecurityEventDashboardRow[];
}

export interface SecurityEventDashboardRow {
  id: string;
  title: string;
  timestamp: Date;
  severity: SecurityEventSeverity;
  source: string;
  assetName: string | null;
  status: SecurityEventStatus;
}

export interface InvestigationsDashboardSection {
  open: number;
  pending: number;
  resolvedToday: number;
  recentlyUpdated: InvestigationDashboardRow[];
}

export interface InvestigationDashboardRow {
  id: string;
  title: string;
  severity: IncidentSeverity;
  ownerName: string | null;
  status: InvestigationStatus;
  updatedAt: Date;
}

export interface IncidentsDashboardSection {
  open: number;
  critical: number;
  resolvedToday: number;
  /** Mean time to resolve across resolved/closed incidents (ms); null if none */
  meanResolutionTimeMs: number | null;
  recent: IncidentDashboardRow[];
}

export interface IncidentDashboardRow {
  id: string;
  caseNumber: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  detectedAt: Date;
  assignedToName: string | null;
}

export interface FindingsDashboardSection {
  open: number;
  critical: number;
  resolved: number;
  newest: FindingDashboardRow[];
  recent: FindingDashboardRow[];
}

export interface FindingDashboardRow {
  id: string;
  title: string;
  severity: FindingSeverity;
  status: FindingStatus;
  assetName: string;
  detectedAt: Date;
}

export interface NotificationsDashboardSection {
  unreadCount: number;
  recent: NotificationInboxItem[];
}

export interface SystemHealthDashboardSection {
  overallStatus: HealthCheckResult["status"];
  application: HealthCheckResult["checks"]["application"]["status"];
  database: HealthCheckResult["checks"]["database"]["status"];
  wazuhWorker: HealthCheckResult["checks"]["workers"]["wazuh"]["status"];
  slaWorker: HealthCheckResult["checks"]["workers"]["slaEscalation"]["status"];
  lastSyncAt: string | null;
  lastHealthCheckAt: string;
  databaseLatencyMs: number | null;
}

export interface SocAnalystDashboardData {
  myWork: MyWorkCard[];
  sla: SlaOverviewMetrics;
  securityEvents: SecurityEventsDashboardSection;
  investigations: InvestigationsDashboardSection;
  incidents: IncidentsDashboardSection;
  findings: FindingsDashboardSection;
  notifications: NotificationsDashboardSection;
  systemHealth: SystemHealthDashboardSection;
  /** Present for UI that maps SLA vocabulary */
  slaStateLabels: {
    atRisk: Extract<SlaState, "APPROACHING">;
    breached: Extract<SlaState, "BREACHED">;
    withinSla: Extract<SlaState, "ON_TRACK">;
  };
}
