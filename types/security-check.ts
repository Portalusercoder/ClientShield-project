export type TlsStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "INVALID" | "NOT_APPLICABLE";

export type HeaderCheckStatus = "PRESENT" | "MISSING" | "INVALID" | "NOT_APPLICABLE";

export type PostureStatus = "Good" | "Needs Attention" | "Critical" | "Not Applicable";

export interface HttpsCheckResult {
  reachable: boolean;
  statusCode: number | null;
  finalUrl: string | null;
  responseTimeMs: number | null;
  httpRedirectsToHttps: boolean | null;
  error: string | null;
}

export interface TlsCheckResult {
  status: TlsStatus;
  subject: string | null;
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysUntilExpiration: number | null;
  currentlyValid: boolean;
  hostnameValid: boolean | null;
  error: string | null;
}

export interface HeaderCheckItem {
  name: string;
  status: HeaderCheckStatus;
  valuePresent: boolean;
  explanation: string;
}

export interface HeadersCheckResult {
  items: HeaderCheckItem[];
  presentCount: number;
  missingCount: number;
}

export interface CookieObservation {
  hasSecure: boolean;
  hasHttpOnly: boolean;
  hasSameSite: boolean;
  sameSiteValue: string | null;
}

export interface CookieCheckResult {
  cookiesObserved: number;
  allSecure: boolean | null;
  allHttpOnly: boolean | null;
  allSameSite: boolean | null;
  observations: CookieObservation[];
  summary: string;
}

export interface SecurityCheckSummary {
  https: HttpsCheckResult;
  tls: TlsCheckResult;
  headers: HeadersCheckResult;
  cookies: CookieCheckResult;
  scoreBreakdown: Record<string, number>;
  posture: {
    https: PostureStatus;
    tls: PostureStatus;
    headers: PostureStatus;
    cookies: PostureStatus;
  };
}

export interface SecurityCheckListItem {
  id: string;
  status: string;
  overallScore: number | null;
  durationMs: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  httpsReachable: boolean | null;
  tlsStatus: TlsStatus | null;
  headersPresent: number | null;
  headersMissing: number | null;
}

export interface SecurityCheckDetail extends SecurityCheckListItem {
  summary: SecurityCheckSummary | null;
  errorMessage: string | null;
  scanType: string;
}

export type SecurityCheckActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
