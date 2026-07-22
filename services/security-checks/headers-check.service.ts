import type { IncomingHttpHeaders } from "node:http";
import type {
  HeaderCheckItem,
  HeadersCheckResult,
} from "@/types/security-check";

function getHeader(
  headers: IncomingHttpHeaders,
  name: string
): string | null {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value.join(", ");
  return typeof value === "string" && value.trim() ? value : null;
}

function hasFrameAncestors(csp: string | null): boolean {
  if (!csp) return false;
  return /frame-ancestors/i.test(csp);
}

/**
 * Evaluates presence of common HTTP security headers.
 * Presence does not guarantee the application is secure.
 */
export function checkSecurityHeaders(
  headers: IncomingHttpHeaders
): HeadersCheckResult {
  const items: HeaderCheckItem[] = [];

  const hsts = getHeader(headers, "strict-transport-security");
  items.push({
    name: "Strict-Transport-Security",
    status: hsts ? "PRESENT" : "MISSING",
    valuePresent: Boolean(hsts),
    explanation: hsts
      ? "HSTS header is present. This indicates HTTPS enforcement intent."
      : "HSTS header is missing. Browsers may allow insecure HTTP fallback.",
  });

  const csp = getHeader(headers, "content-security-policy");
  items.push({
    name: "Content-Security-Policy",
    status: csp ? "PRESENT" : "MISSING",
    valuePresent: Boolean(csp),
    explanation: csp
      ? "Content-Security-Policy is present. Effectiveness depends on policy quality."
      : "Content-Security-Policy is missing. XSS and injection risk may be higher.",
  });

  const xcto = getHeader(headers, "x-content-type-options");
  const xctoValid = xcto?.toLowerCase() === "nosniff";
  items.push({
    name: "X-Content-Type-Options",
    status: !xcto ? "MISSING" : xctoValid ? "PRESENT" : "INVALID",
    valuePresent: Boolean(xcto),
    explanation: !xcto
      ? "X-Content-Type-Options is missing."
      : xctoValid
        ? "X-Content-Type-Options is set to nosniff."
        : "X-Content-Type-Options is present but not set to nosniff.",
  });

  const referrer = getHeader(headers, "referrer-policy");
  items.push({
    name: "Referrer-Policy",
    status: referrer ? "PRESENT" : "MISSING",
    valuePresent: Boolean(referrer),
    explanation: referrer
      ? "Referrer-Policy is present."
      : "Referrer-Policy is missing. Referrer leakage risk may be higher.",
  });

  const permissions = getHeader(headers, "permissions-policy");
  items.push({
    name: "Permissions-Policy",
    status: permissions ? "PRESENT" : "MISSING",
    valuePresent: Boolean(permissions),
    explanation: permissions
      ? "Permissions-Policy is present."
      : "Permissions-Policy is missing.",
  });

  const xfo = getHeader(headers, "x-frame-options");
  const clickjackingOk = Boolean(xfo) || hasFrameAncestors(csp);
  items.push({
    name: "Clickjacking-Protection",
    status: clickjackingOk ? "PRESENT" : "MISSING",
    valuePresent: clickjackingOk,
    explanation: clickjackingOk
      ? xfo
        ? "X-Frame-Options is present."
        : "CSP frame-ancestors provides clickjacking protection."
      : "Neither X-Frame-Options nor CSP frame-ancestors is present.",
  });

  return {
    items,
    presentCount: items.filter((i) => i.status === "PRESENT").length,
    missingCount: items.filter(
      (i) => i.status === "MISSING" || i.status === "INVALID"
    ).length,
  };
}
