import type {
  BusinessImpact,
  ExploitabilityAssessment,
  FindingSeverity,
  FindingSource,
  FindingStatus,
  RemediationComplexity,
  RemediationPriority,
  RemediationStatus,
  TriagePriority,
} from "@prisma/client";

export const UNRESOLVED_FINDING_STATUSES: FindingStatus[] = [
  "OPEN",
  "VALIDATED",
  "IN_PROGRESS",
];

/**
 * Statuses that must never be auto-resolved by passive rechecks.
 */
export const MANUAL_TERMINAL_FINDING_STATUSES: FindingStatus[] = [
  "ACCEPTED_RISK",
  "FALSE_POSITIVE",
];

export interface FindingListItem {
  id: string;
  title: string;
  severity: FindingSeverity;
  status: FindingStatus;
  source: FindingSource;
  code: string | null;
  clientId: string | null;
  clientName: string | null;
  assetId: string;
  assetName: string;
  assignedToUserId: string | null;
  assignedToName: string | null;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  dueDate: Date | null;
  isOverdue: boolean;
  /** Count of FindingInstance rows (0 for non-aggregated sources). */
  instanceCount: number;
  triagePriority: TriagePriority | null;
  confidence: string | null;
}

export interface FindingInstanceItem {
  id: string;
  url: string | null;
  normalizedPath: string;
  httpMethod: string | null;
  parameter: string | null;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  scanId: string | null;
  evidence: unknown;
}

export interface FindingDetail extends FindingListItem {
  description: string | null;
  remediationGuidance: string | null;
  evidence: unknown;
  cvssScore: number | null;
  cveId: string | null;
  scanId: string | null;
  statusReason: string | null;
  acceptedRiskApprovedByUserId: string | null;
  acceptedRiskApprovedByName: string | null;
  acceptedRiskApprovedAt: Date | null;
  acceptedRiskReviewDate: Date | null;
  riskAcceptanceReviewDue: boolean;
  validatedAt: Date | null;
  validatedByUserId: string | null;
  validatedByName: string | null;
  validationNotes: string | null;
  analystNotes: string | null;
  businessImpact: BusinessImpact | null;
  exploitabilityAssessment: ExploitabilityAssessment | null;
  remediationComplexity: RemediationComplexity | null;
  suggestedPriority: TriagePriority;
  assetCriticality: string;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  organizationId: string;
  /** ZAP confidence label when present (separate from severity). */
  risk: string | null;
  pluginId: string | null;
  cweId: string | null;
  wascId: string | null;
}

export interface FindingFilters {
  search?: string;
  clientId?: string | "ALL";
  assetId?: string | "ALL";
  severity?: FindingSeverity | "ALL";
  status?: FindingStatus | "ALL";
  source?: FindingSource | "ALL";
  triagePriority?: TriagePriority | "ALL";
  needsTriage?: boolean;
  assignedToUserId?: string | "ALL";
  page?: number;
  pageSize?: number;
}

export interface FindingSummaryCards {
  needsTriage: number;
  validated: number;
  inRemediation: number;
  acceptedRisk: number;
  overdue: number;
  resolvedThisMonth: number;
  /** Kept for secondary filters / charts */
  criticalOpen: number;
  highOpen: number;
  mediumOpen: number;
  lowOpen: number;
}

export interface FindingListResult {
  findings: FindingListItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: FindingSummaryCards;
  clients: { id: string; name: string }[];
  assets: { id: string; name: string; clientId: string }[];
  users: { id: string; name: string | null; email: string }[];
}

export interface RemediationListItem {
  id: string;
  title: string;
  status: RemediationStatus;
  priority: RemediationPriority;
  dueDate: Date | null;
  isOverdue: boolean;
  findingId: string | null;
  findingTitle: string | null;
  findingSeverity: FindingSeverity | null;
  clientName: string | null;
  assetId: string;
  assetName: string;
  assignedToUserId: string | null;
  assignedToName: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface RemediationFilters {
  search?: string;
  status?: RemediationStatus | "ALL";
  severity?: FindingSeverity | "ALL";
  assignedToUserId?: string | "ALL";
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface RemediationListResult {
  tasks: RemediationListItem[];
  total: number;
  page: number;
  pageSize: number;
  users: { id: string; name: string | null; email: string }[];
}

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export const PASSIVE_REMEDIATION_GUIDANCE: Record<string, string> = {
  HTTPS_UNAVAILABLE:
    "Restore HTTPS availability for the asset. Confirm DNS, certificate binding, and web server TLS listeners.",
  TLS_EXPIRED:
    "Renew the TLS certificate immediately and redeploy it to the web server or load balancer.",
  TLS_EXPIRING_SOON:
    "Renew the TLS certificate before expiration and verify automated renewal is working.",
  TLS_INVALID:
    "Replace the TLS certificate with one that matches the hostname and is issued by a trusted CA.",
  HSTS_MISSING:
    "Add a Strict-Transport-Security response header with an appropriate max-age on HTTPS responses.",
  CSP_MISSING:
    "Define and deploy a Content-Security-Policy suited to the application. Start in report-only if needed.",
  CLICKJACKING_PROTECTION_MISSING:
    "Set X-Frame-Options or a CSP frame-ancestors directive to restrict framing.",
  XCTO_MISSING:
    "Set X-Content-Type-Options: nosniff on responses.",
  REFERRER_POLICY_MISSING:
    "Set a Referrer-Policy header appropriate for the application.",
  PERMISSIONS_POLICY_MISSING:
    "Set a Permissions-Policy header to restrict unused browser features.",
  COOKIE_SECURE_MISSING:
    "Ensure session and sensitive cookies set the Secure attribute.",
  COOKIE_HTTPONLY_MISSING:
    "Ensure session cookies set the HttpOnly attribute where JavaScript access is not required.",
};
