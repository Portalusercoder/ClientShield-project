/**
 * Content-Security-Policy builder (Phase 6P3).
 *
 * Exceptions (documented in SECURITY.md):
 * - Auth0 OIDC: https://*.auth0.com (+ tenant issuer origin)
 * - style-src 'unsafe-inline': required for Next.js App Router + Tailwind in this codebase
 * - script-src 'unsafe-eval': development HMR only
 */
import { getSecurityConfig } from "./config";

export interface CspOptions {
  isProduction?: boolean;
  appOrigin?: string;
  auth0Issuer?: string;
  reportOnly?: boolean;
}

function auth0Origins(issuer?: string): string[] {
  const origins = new Set<string>([
    "https://*.auth0.com",
    "https://*.eu.auth0.com",
    "https://*.us.auth0.com",
    "https://*.au.auth0.com",
  ]);
  if (issuer) {
    try {
      origins.add(new URL(issuer).origin);
    } catch {
      // ignore
    }
  }
  return [...origins];
}

export function buildContentSecurityPolicy(opts: CspOptions = {}): string {
  const isProduction =
    opts.isProduction ?? process.env.NODE_ENV === "production";
  const appOrigin =
    opts.appOrigin?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  let appOriginParsed = "";
  try {
    if (appOrigin) appOriginParsed = new URL(appOrigin).origin;
  } catch {
    appOriginParsed = "";
  }

  const auth0 = auth0Origins(opts.auth0Issuer ?? process.env.AUTH0_ISSUER);

  const scriptSrc = [
    "'self'",
    ...auth0,
    ...(isProduction ? [] : ["'unsafe-eval'"]),
  ];

  const styleSrc = ["'self'", "'unsafe-inline'"];
  const connectSrc = [
    "'self'",
    ...auth0,
    ...(appOriginParsed ? [appOriginParsed] : []),
    ...(isProduction
      ? []
      : ["ws:", "wss:", "http://localhost:*", "http://127.0.0.1:*"]),
  ];

  const directives: string[] = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `script-src ${scriptSrc.join(" ")}`,
    `style-src ${styleSrc.join(" ")}`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src ${connectSrc.join(" ")}`,
    `frame-src 'self' ${auth0.join(" ")}`,
    `form-action 'self' ${auth0.join(" ")}`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
  ];

  if (isProduction) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

export function getCspHeaderName(reportOnly?: boolean): string {
  const cfg = getSecurityConfig();
  const ro = reportOnly ?? cfg.cspReportOnly;
  return ro
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
}
