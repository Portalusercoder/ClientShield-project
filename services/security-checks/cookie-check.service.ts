import type { IncomingHttpHeaders } from "node:http";
import type {
  CookieCheckResult,
  CookieObservation,
} from "@/types/security-check";

/**
 * Passively inspects Set-Cookie attributes.
 * Never stores or returns cookie names/values.
 */
export function checkCookieSecurity(
  headers: IncomingHttpHeaders
): CookieCheckResult {
  const raw = headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];

  if (cookies.length === 0) {
    return {
      cookiesObserved: 0,
      allSecure: null,
      allHttpOnly: null,
      allSameSite: null,
      observations: [],
      summary: "No Set-Cookie headers observed.",
    };
  }

  const observations: CookieObservation[] = cookies.map((cookie) => {
    const lower = cookie.toLowerCase();
    const sameSiteMatch = lower.match(/;\s*samesite=([^;]+)/i);
    return {
      hasSecure: /;\s*secure(?:;|$)/i.test(cookie),
      hasHttpOnly: /;\s*httponly(?:;|$)/i.test(cookie),
      hasSameSite: Boolean(sameSiteMatch),
      sameSiteValue: sameSiteMatch?.[1]?.trim() ?? null,
    };
  });

  // Strip any accidental value content — only attribute flags remain in observations.
  const allSecure = observations.every((o) => o.hasSecure);
  const allHttpOnly = observations.every((o) => o.hasHttpOnly);
  const allSameSite = observations.every((o) => o.hasSameSite);

  const issues: string[] = [];
  if (!allSecure) issues.push("one or more cookies lack Secure");
  if (!allHttpOnly) issues.push("one or more cookies lack HttpOnly");
  if (!allSameSite) issues.push("one or more cookies lack SameSite");

  return {
    cookiesObserved: cookies.length,
    allSecure,
    allHttpOnly,
    allSameSite,
    observations,
    summary:
      issues.length === 0
        ? `${cookies.length} cookie(s) observed with Secure, HttpOnly, and SameSite attributes.`
        : `${cookies.length} cookie(s) observed; ${issues.join("; ")}.`,
  };
}
