export const ZAP_BASELINE_SCAN_TYPE = "ZAP_BASELINE";

export const ZAP_RATE_LIMIT_MS = 5 * 60_000;

/** Max alerts fetched from ZAP per scan (pagination capped). */
export const ZAP_MAX_ALERTS = 500;

export type ZapRiskCode = "0" | "1" | "2" | "3" | number | string;

export interface ZapRawAlert {
  id?: string;
  pluginId?: string;
  alertRef?: string;
  name?: string;
  risk?: string;
  riskcode?: ZapRiskCode;
  confidence?: string;
  confidencecode?: string | number;
  description?: string;
  solution?: string;
  otherinfo?: string;
  reference?: string;
  cweid?: string | number;
  wascid?: string | number;
  url?: string;
  method?: string;
  param?: string;
  attack?: string;
  evidence?: string;
  messageId?: string;
  sourceid?: string;
}

export interface ZapNormalizedInstance {
  instanceKey: string;
  url: string | null;
  normalizedPath: string;
  httpMethod: string;
  parameter: string | null;
  evidence: Record<string, unknown>;
}

export interface ZapNormalizedFinding {
  /**
   * Finding-level code: `ZAP:{pluginId}`
   * Path is NOT included — locations are FindingInstances.
   */
  code: string;
  pluginId: string;
  title: string;
  description: string | null;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH";
  remediationGuidance: string | null;
  cweId: string | null;
  confidence: string | null;
  risk: string | null;
  findingEvidence: Record<string, unknown>;
  instance: ZapNormalizedInstance;
}

export interface ZapAlertCounts {
  informational: number;
  low: number;
  medium: number;
  high: number;
}

export interface ZapScanSummary {
  scanner: "OWASP_ZAP";
  scanMode: "BASELINE_PASSIVE";
  targetHost: string;
  spiderMaxMinutes: number;
  alertCounts: ZapAlertCounts;
  findingsCreated: number;
  findingsUpdated: number;
  findingsReopened: number;
  instancesCreated: number;
  instancesUpdated: number;
  alertsFetched: number;
  warnings: string[];
  /**
   * Resolution policy for this phase:
   * OWASP_ZAP findings are NOT auto-resolved when absent from a later baseline scan.
   * Absence does not prove remediation; explicit verification is deferred.
   */
  resolutionPolicy: "NO_AUTO_RESOLVE_ON_ABSENCE";
}

export interface ZapScanListItem {
  id: string;
  status: string;
  scanType: string;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  createdAt: Date;
  scannerVersion: string | null;
  errorMessage: string | null;
  alertCounts: ZapAlertCounts | null;
}

export interface ZapScanDetail extends ZapScanListItem {
  summary: ZapScanSummary | null;
  assetId: string;
  assetName: string;
  findingsCreated: number;
  findingsUpdated: number;
}

export type ZapActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
