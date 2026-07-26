/**
 * Executive Dashboard DTOs (Phase 6C2).
 * High-level posture / KPI read models — not an analyst work queue.
 */
import type { HealthCheckResult } from "@/services/health.service";

export type ExecutiveGrade = "A" | "B" | "C" | "D" | "F";

export interface ExecutivePostureScore {
  /** 0–100 (higher = better) */
  score: number;
  grade: ExecutiveGrade;
  /** Transparent deduction inputs used for the score */
  factors: {
    criticalIncidents: number;
    criticalFindings: number;
    breachedSla: number;
    openInvestigations: number;
    openSecurityEvents: number;
  };
  deductions: {
    criticalIncidents: number;
    criticalFindings: number;
    breachedSla: number;
    openInvestigations: number;
    openSecurityEvents: number;
    total: number;
  };
  /** Documented weight caps used in calculation */
  weights: ExecutivePostureWeights;
}

export interface ExecutivePostureWeights {
  criticalIncidentPer: number;
  criticalIncidentCap: number;
  criticalFindingPer: number;
  criticalFindingCap: number;
  breachedSlaPer: number;
  breachedSlaCap: number;
  openInvestigationPer: number;
  openInvestigationCap: number;
  openSecurityEventPer: number;
  openSecurityEventCap: number;
}

export interface ExecutiveKpiCards {
  totalClients: number;
  totalAssets: number;
  activeInvestigations: number;
  openIncidents: number;
  criticalFindings: number;
  openSecurityEvents: number;
  posture: ExecutivePostureScore;
  /** Existing org asset-posture average when assessed assets exist */
  assetPostureAverage: number | null;
}

export interface TrendPeriodCounts {
  incidentsCreated: number;
  findingsCreated: number;
  investigationsOpened: number;
  securityEventsIngested: number;
  incidentsResolved: number;
}

export interface ExecutiveTrends {
  last7Days: TrendPeriodCounts;
  last30Days: TrendPeriodCounts;
}

export interface SeverityCountRow {
  severity: string;
  count: number;
}

export interface NamedRiskRow {
  id: string;
  name: string;
  securityScore: number | null;
  href: string;
}

export interface ExecutiveRiskDistribution {
  findingsBySeverity: SeverityCountRow[];
  incidentsBySeverity: SeverityCountRow[];
  securityEventsBySeverity: SeverityCountRow[];
  /** Buckets of stored asset securityScore */
  assetRiskBuckets: { label: string; count: number }[];
  /** Buckets of stored client securityScore */
  clientRiskBuckets: { label: string; count: number }[];
  highestRiskAssets: NamedRiskRow[];
  highestRiskClients: NamedRiskRow[];
}

export interface ExecutiveSlaCompliance {
  compliancePercent: number | null;
  breached: number;
  atRisk: number;
  withinSla: number;
  evaluated: number;
  averageResponseTimeMs: number | null;
  averageResolutionTimeMs: number | null;
  hasSlaPolicies: boolean;
}

export interface AnalystWorkloadRow {
  userId: string;
  name: string;
  count: number;
}

export interface ExecutiveOperationalOverview {
  openInvestigationsByAnalyst: AnalystWorkloadRow[];
  openIncidentsByAnalyst: AnalystWorkloadRow[];
  attentionQueueSize: number;
  notificationVolume7d: number;
  notificationVolume30d: number;
  averageAnalystWorkload: number | null;
  investigationBacklog: number;
}

export interface ExecutiveClientOverviewRow {
  id: string;
  name: string;
  assets: number;
  openIncidents: number;
  openFindings: number;
  openInvestigations: number;
  securityPosture: number | null;
  lastActivityAt: Date | null;
}

export interface ExecutivePlatformHealth {
  overallStatus: HealthCheckResult["status"];
  application: HealthCheckResult["checks"]["application"]["status"];
  database: HealthCheckResult["checks"]["database"]["status"];
  wazuhWorker: HealthCheckResult["checks"]["workers"]["wazuh"]["status"];
  slaWorker: HealthCheckResult["checks"]["workers"]["slaEscalation"]["status"];
  lastSyncAt: string | null;
  lastHealthCheckAt: string;
  buildVersion: string;
  gitSha: string;
  databaseLatencyMs: number | null;
}

export interface ExecutiveDashboardData {
  kpis: ExecutiveKpiCards;
  trends: ExecutiveTrends;
  risk: ExecutiveRiskDistribution;
  sla: ExecutiveSlaCompliance;
  operational: ExecutiveOperationalOverview;
  clients: ExecutiveClientOverviewRow[];
  platformHealth: ExecutivePlatformHealth;
}
