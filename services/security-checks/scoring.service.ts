import type {
  CookieCheckResult,
  HeadersCheckResult,
  HttpsCheckResult,
  PostureStatus,
  SecurityCheckSummary,
  TlsCheckResult,
} from "@/types/security-check";

/**
 * Configurable score weights for the passive posture indicator.
 * This is NOT a guarantee of security, penetration test result, or certification.
 */
export const SCORE_WEIGHTS = {
  httpsTls: 30,
  hsts: 15,
  csp: 15,
  clickjacking: 10,
  xContentTypeOptions: 10,
  referrerPolicy: 5,
  permissionsPolicy: 5,
  cookieSecurity: 10,
} as const;

export function calculateSecurityScore(input: {
  https: HttpsCheckResult;
  tls: TlsCheckResult;
  headers: HeadersCheckResult;
  cookies: CookieCheckResult;
}): {
  score: number;
  breakdown: Record<string, number>;
  posture: SecurityCheckSummary["posture"];
} {
  const breakdown: Record<string, number> = {};

  // HTTPS + TLS block (30)
  let httpsTls = 0;
  if (input.https.reachable && input.tls.status === "VALID") {
    httpsTls = SCORE_WEIGHTS.httpsTls;
  } else if (
    input.https.reachable &&
    input.tls.status === "EXPIRING_SOON"
  ) {
    httpsTls = Math.round(SCORE_WEIGHTS.httpsTls * 0.7);
  } else if (input.https.reachable) {
    httpsTls = Math.round(SCORE_WEIGHTS.httpsTls * 0.3);
  }
  breakdown.httpsTls = httpsTls;

  const headerScore = (name: string, weight: number) => {
    const item = input.headers.items.find((h) => h.name === name);
    if (!item) return 0;
    if (item.status === "PRESENT") return weight;
    if (item.status === "INVALID") return Math.round(weight * 0.3);
    return 0;
  };

  breakdown.hsts = headerScore("Strict-Transport-Security", SCORE_WEIGHTS.hsts);
  breakdown.csp = headerScore("Content-Security-Policy", SCORE_WEIGHTS.csp);
  breakdown.clickjacking = headerScore(
    "Clickjacking-Protection",
    SCORE_WEIGHTS.clickjacking
  );
  breakdown.xContentTypeOptions = headerScore(
    "X-Content-Type-Options",
    SCORE_WEIGHTS.xContentTypeOptions
  );
  breakdown.referrerPolicy = headerScore(
    "Referrer-Policy",
    SCORE_WEIGHTS.referrerPolicy
  );
  breakdown.permissionsPolicy = headerScore(
    "Permissions-Policy",
    SCORE_WEIGHTS.permissionsPolicy
  );

  // Cookies: N/A if none observed — redistribute fairly by awarding full points
  // when no cookies are set (not automatically insecure).
  if (input.cookies.cookiesObserved === 0) {
    breakdown.cookieSecurity = SCORE_WEIGHTS.cookieSecurity;
  } else {
    let cookiePoints = 0;
    if (input.cookies.allSecure) cookiePoints += 4;
    if (input.cookies.allHttpOnly) cookiePoints += 3;
    if (input.cookies.allSameSite) cookiePoints += 3;
    breakdown.cookieSecurity = cookiePoints;
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      Object.values(breakdown).reduce((sum, v) => sum + v, 0)
    )
  );

  return {
    score,
    breakdown,
    posture: {
      https: postureHttps(input.https),
      tls: postureTls(input.tls),
      headers: postureHeaders(input.headers),
      cookies: postureCookies(input.cookies),
    },
  };
}

function postureHttps(https: HttpsCheckResult): PostureStatus {
  if (!https.reachable) return "Critical";
  if (https.statusCode && https.statusCode >= 500) return "Needs Attention";
  return "Good";
}

function postureTls(tls: TlsCheckResult): PostureStatus {
  if (tls.status === "VALID") return "Good";
  if (tls.status === "EXPIRING_SOON") return "Needs Attention";
  if (tls.status === "NOT_APPLICABLE") return "Not Applicable";
  return "Critical";
}

function postureHeaders(headers: HeadersCheckResult): PostureStatus {
  if (headers.missingCount === 0) return "Good";
  if (headers.missingCount <= 2) return "Needs Attention";
  return "Critical";
}

function postureCookies(cookies: CookieCheckResult): PostureStatus {
  if (cookies.cookiesObserved === 0) return "Not Applicable";
  if (cookies.allSecure && cookies.allHttpOnly && cookies.allSameSite) {
    return "Good";
  }
  if (!cookies.allSecure) return "Critical";
  return "Needs Attention";
}
