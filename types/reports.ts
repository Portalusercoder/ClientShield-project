/**
 * Immutable Security Posture Report snapshot types.
 * Stored in Report.generatedData — never mutated after READY.
 */

export interface ReportSnapshotMetadata {
  reportType: "SECURITY_POSTURE" | "EXECUTIVE_SUMMARY" | "TECHNICAL_FINDINGS" | "REMEDIATION_STATUS";
  title: string;
  clientName: string;
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
  generatedAt: string;
  version: number;
  confidentiality: "CONFIDENTIAL";
  organizationName: string;
}

export interface ReportPostureSummary {
  score: number | null;
  coverage: string | null;
  assetsAssessed: number;
  assetsTotal: number;
  coveragePercent: number | null;
  openFindings: number;
  validatedFindings: number;
  acceptedRisks: number;
  disclaimer: string;
}

export interface ReportAssetRow {
  name: string;
  type: string;
  environment: string;
  criticality: string;
  postureScore: number | null;
  coverage: string | null;
  lastAssessedAt: string | null;
  openFindings: number;
  validatedFindings: number;
}

export interface ReportFindingCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface ReportValidatedFinding {
  title: string;
  severity: string;
  priority: string | null;
  status: string;
  assetName: string;
  source: string;
  cweId: string | null;
  instanceCount: number;
  description: string | null;
  businessImpact: string | null;
  remediationGuidance: string | null;
  remediationStatus: string | null;
}

export interface ReportOpenObservation {
  title: string;
  severity: string;
  source: string;
  confidence: string | null;
  assetName: string;
  instanceCount: number;
}

export interface ReportAcceptedRisk {
  title: string;
  severity: string;
  assetName: string;
  reason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  reviewDate: string | null;
}

export interface ReportRemediationSummary {
  total: number;
  open: number;
  inProgress: number;
  blocked: number;
  completed: number;
  overdue: number;
  tasks: Array<{
    title: string;
    findingTitle: string | null;
    severity: string | null;
    priority: string;
    status: string;
    assignedTo: string | null;
    dueDate: string | null;
  }>;
}

export interface ReportScoreTrendPoint {
  date: string;
  score: number;
  coverage: string | null;
}

export interface ReportMethodology {
  passiveChecksUsed: boolean;
  zapBaselineUsed: boolean;
  analystTriageUsed: boolean;
  methods: string[];
}

export interface SecurityPostureReportSnapshot {
  schemaVersion: 1;
  reportMetadata: ReportSnapshotMetadata;
  executiveSummary: {
    posture: ReportPostureSummary;
    validatedBySeverity: ReportFindingCounts;
    openObservations: number;
    acceptedRisks: number;
    remediationProgress: {
      completed: number;
      total: number;
    };
    explanation: string;
  };
  postureDetail: {
    score: number | null;
    coverage: string | null;
    breakdownNotes: string[];
  };
  assets: ReportAssetRow[];
  findingSummary: {
    allBySeverity: ReportFindingCounts;
    validatedBySeverity: ReportFindingCounts;
    openObservationsBySeverity: ReportFindingCounts;
    /** Present on reports generated after design upgrade; optional for older snapshots */
    statusCounts?: {
      validated: number;
      openObservations: number;
      acceptedRisks: number;
      resolved: number;
      falsePositives: number;
    };
  };
  validatedFindings: ReportValidatedFinding[];
  openObservations: ReportOpenObservation[];
  acceptedRisks: ReportAcceptedRisk[];
  remediation: ReportRemediationSummary;
  scoreTrend: ReportScoreTrendPoint[];
  scoreTrendInsufficient: boolean;
  methodology: ReportMethodology;
  limitations: string[];
}
