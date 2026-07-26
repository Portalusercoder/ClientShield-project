/**
 * Security Analytics DTOs (Phase 6C4).
 * On-demand historical insights — not dashboard work queues.
 */

export type AnalyticsRangeDays = 7 | 30 | 90;

export interface AnalyticsNamedCount {
  id: string | null;
  name: string;
  count: number;
}

export interface AnalyticsDistributionRow {
  key: string;
  label: string;
  count: number;
}

export interface AnalyticsSeriesPoint {
  /** ISO date (day) or week-start ISO date */
  bucket: string;
  label: string;
  value: number;
}

export interface DurationMetricWindow {
  meanMs: number | null;
  medianMs: number | null;
  p95Ms: number | null;
  sampleCount: number;
}

export interface DurationMetricWithTrends {
  /** Current window = selected rangeDays */
  current: DurationMetricWindow;
  d7: DurationMetricWindow;
  d30: DurationMetricWindow;
  d90: DurationMetricWindow;
}

export interface SecurityKpiAnalytics {
  mttd: DurationMetricWithTrends;
  mtta: DurationMetricWithTrends;
  mttr: DurationMetricWithTrends;
}

export interface IncidentAnalytics {
  createdSeries: AnalyticsSeriesPoint[];
  resolvedSeries: AnalyticsSeriesPoint[];
  criticalSeries: AnalyticsSeriesPoint[];
  severityDistribution: AnalyticsDistributionRow[];
  resolutionVelocitySeries: AnalyticsSeriesPoint[];
  ageDistribution: AnalyticsDistributionRow[];
  topCategories: AnalyticsNamedCount[];
  topAssets: AnalyticsNamedCount[];
  topClients: AnalyticsNamedCount[];
  totals: {
    created: number;
    resolved: number;
    criticalCreated: number;
  };
}

export interface InvestigationAnalytics {
  started: number;
  completed: number;
  averageDurationMs: number | null;
  medianDurationMs: number | null;
  backlogGrowth: number;
  completionRate: number | null;
  averagePerAnalyst: number | null;
  analystThroughput: AnalyticsNamedCount[];
  startedSeries: AnalyticsSeriesPoint[];
  completedSeries: AnalyticsSeriesPoint[];
}

export interface FindingAnalytics {
  newFindings: number;
  resolvedFindings: number;
  remediationRate: number | null;
  severityDistribution: AnalyticsDistributionRow[];
  averageAgeMs: number | null;
  oldestFindings: Array<{
    id: string;
    title: string;
    severity: string;
    ageMs: number;
    firstDetectedAt: string;
  }>;
  topRecurringTypes: AnalyticsNamedCount[];
  newSeries: AnalyticsSeriesPoint[];
  resolvedSeries: AnalyticsSeriesPoint[];
}

export interface SecurityEventAnalytics {
  ingested: number;
  convertedToInvestigations: number;
  alertToInvestigationRatio: number | null;
  severityDistribution: AnalyticsDistributionRow[];
  topSources: AnalyticsNamedCount[];
  topAssets: AnalyticsNamedCount[];
  ingestedSeries: AnalyticsSeriesPoint[];
}

export interface SlaAnalytics {
  complianceTrend: AnalyticsSeriesPoint[];
  breachTrend: AnalyticsSeriesPoint[];
  averageResponseTimeMs: number | null;
  averageResolutionTimeMs: number | null;
  escalationFrequency: number;
  resolutionBeforeBreachPct: number | null;
  currentCompliancePct: number | null;
  breachedOpen: number;
  atRiskOpen: number;
}

export interface RiskAnalytics {
  postureTrend: AnalyticsSeriesPoint[];
  riskScoreTrend: AnalyticsSeriesPoint[];
  highestRiskClients: Array<{
    id: string;
    name: string;
    securityScore: number | null;
  }>;
  highestRiskAssets: Array<{
    id: string;
    name: string;
    securityScore: number | null;
  }>;
  criticalFindingsSeries: AnalyticsSeriesPoint[];
  criticalIncidentsSeries: AnalyticsSeriesPoint[];
}

export interface AnalystPerformanceRow {
  userId: string;
  name: string;
  openWorkload: number;
  completedInvestigations: number;
  completedIncidents: number;
  averageResolutionTimeMs: number | null;
  averageInvestigationDurationMs: number | null;
  slaCompliancePct: number | null;
}

export interface AnalystAnalytics {
  leaderboard: AnalystPerformanceRow[];
}

export interface SecurityAnalyticsData {
  organizationId: string;
  rangeDays: AnalyticsRangeDays;
  generatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  kpis: SecurityKpiAnalytics;
  incidents: IncidentAnalytics;
  investigations: InvestigationAnalytics;
  findings: FindingAnalytics;
  securityEvents: SecurityEventAnalytics;
  sla: SlaAnalytics;
  risk: RiskAnalytics;
  analysts: AnalystAnalytics;
}
