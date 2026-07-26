/**
 * Apply production security headers (Phase 6P3).
 */
import { getSecurityConfig } from "./config";
import { buildContentSecurityPolicy, getCspHeaderName } from "./csp";

export type HeaderSink = {
  set(name: string, value: string): void;
};

export function applySecurityHeaders(headers: HeaderSink): void {
  const cfg = getSecurityConfig();

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-DNS-Prefetch-Control", "off");
  headers.set("X-XSS-Protection", "0");

  if (cfg.enableHsts && process.env.NODE_ENV === "production") {
    headers.set(
      "Strict-Transport-Security",
      `max-age=${cfg.hstsMaxAgeSeconds}; includeSubDomains; preload`
    );
  }

  if (cfg.enableCsp) {
    headers.set(
      getCspHeaderName(),
      buildContentSecurityPolicy({
        isProduction: process.env.NODE_ENV === "production",
      })
    );
  }
}

export { buildContentSecurityPolicy, getCspHeaderName } from "./csp";
