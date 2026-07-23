import type { FindingSeverity } from "@prisma/client";
import type { AttentionSummary } from "@/types/attention";
import type { IncidentCaseMetrics } from "@/types/incident-case";
import type { InvestigationMetrics } from "@/types/investigations";
import type { DashboardIncident } from "@/types/incidents";
import type { DashboardSecurityEvent } from "@/types/security-events";

export interface DashboardStats {
  totalClients: number;
  assetsMonitored: number;
  criticalVulnerabilities: number;
  highVulnerabilities: number;
  openIncidents: number;
  newSecurityEvents: number;
  criticalSecurityEvents: number;
  highSecurityEvents: number;
  unmappedSecurityEvents: number;
  securityEventsLast24h: number;
  actionableSecurityEvents: number;
  securityEventsUnderReview: number;
  escalatedSecurityEvents: number;
  criticalHighSecurityEvents: number;
  noisyFilteredSecurityEvents: number;
  /** null when no assessed assets */
  averageSecurityScore: number | null;
  assetsAssessed: number;
  assetsTotal: number;
}

export interface SeverityDistribution {
  severity: FindingSeverity;
  count: number;
  color: string;
}

export interface DashboardClientAttention {
  id: string;
  name: string;
  securityScore: number;
  criticalFindings: number;
  openIncidents: number;
}

export interface DashboardFinding {
  id: string;
  title: string;
  severity: FindingSeverity;
  assetName: string;
  clientName: string;
  detectedAt: Date;
  instanceCount?: number;
}

export interface DashboardActivity {
  id: string;
  action: string;
  description: string;
  actor: string;
  timestamp: Date;
}

export interface DashboardRemediationMetric {
  openTasks: number;
  inProgress: number;
  completedThisMonth: number;
  overdueTasks: number;
  averageResolutionDays: number;
  completionRate: number;
}

export interface DashboardData {
  stats: DashboardStats;
  clientManagement: {
    activeClients: number;
    clientsOnboarding: number;
    clientsNotReady: number;
    clientsWithCriticalFindings: number;
    clientsWithOpenIncidents: number;
  };
  caseMetrics: IncidentCaseMetrics;
  investigationMetrics: InvestigationMetrics;
  severityDistribution: SeverityDistribution[];
  securityEventSeverityDistribution: {
    severity: string;
    count: number;
  }[];
  topWazuhRules: { ruleId: string; title: string; count: number }[];
  topAffectedAssets: {
    assetId: string | null;
    assetName: string;
    count: number;
  }[];
  clientsRequiringAttention: DashboardClientAttention[];
  attentionSummary: AttentionSummary;
  recentFindings: DashboardFinding[];
  recentIncidents: DashboardIncident[];
  recentSecurityEvents: DashboardSecurityEvent[];
  recentActivity: DashboardActivity[];
  remediationMetrics: DashboardRemediationMetric;
}

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}
