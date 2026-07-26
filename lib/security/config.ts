/**
 * Security configuration (Phase 6P3).
 * Edge-safe: reads process.env directly (no Zod / Node-only imports).
 */

function parseBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw === "") return defaultValue;
  return raw === "true" || raw === "1";
}

function parseIntEnv(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface SecurityConfig {
  enableHsts: boolean;
  enableCsp: boolean;
  cspReportOnly: boolean;
  enableRateLimiting: boolean;
  /** Auth / login endpoints */
  rateLimitAuthMax: number;
  rateLimitAuthWindowMs: number;
  /** General API / server actions */
  rateLimitApiMax: number;
  rateLimitApiWindowMs: number;
  /** Health probe (lightweight) */
  rateLimitHealthMax: number;
  rateLimitHealthWindowMs: number;
  /** Expensive ops (ZAP, Wazuh sync, reports) */
  rateLimitExpensiveMax: number;
  rateLimitExpensiveWindowMs: number;
  hstsMaxAgeSeconds: number;
  sessionMaxAgeSeconds: number;
}

let cached: SecurityConfig | null = null;

export function getSecurityConfig(): SecurityConfig {
  if (cached) return cached;
  const isProd = process.env.NODE_ENV === "production";
  cached = {
    enableHsts: parseBool(process.env.ENABLE_HSTS, isProd),
    enableCsp: parseBool(process.env.ENABLE_CSP, true),
    cspReportOnly: parseBool(process.env.CSP_REPORT_ONLY, !isProd),
    enableRateLimiting: parseBool(process.env.ENABLE_RATE_LIMITING, true),
    rateLimitAuthMax: parseIntEnv(process.env.RATE_LIMIT_AUTH_MAX, 20),
    rateLimitAuthWindowMs: parseIntEnv(
      process.env.RATE_LIMIT_AUTH_WINDOW_MS,
      60_000
    ),
    rateLimitApiMax: parseIntEnv(process.env.RATE_LIMIT_API_MAX, 120),
    rateLimitApiWindowMs: parseIntEnv(
      process.env.RATE_LIMIT_API_WINDOW_MS,
      60_000
    ),
    rateLimitHealthMax: parseIntEnv(process.env.RATE_LIMIT_HEALTH_MAX, 60),
    rateLimitHealthWindowMs: parseIntEnv(
      process.env.RATE_LIMIT_HEALTH_WINDOW_MS,
      60_000
    ),
    rateLimitExpensiveMax: parseIntEnv(
      process.env.RATE_LIMIT_EXPENSIVE_MAX,
      10
    ),
    rateLimitExpensiveWindowMs: parseIntEnv(
      process.env.RATE_LIMIT_EXPENSIVE_WINDOW_MS,
      60_000
    ),
    hstsMaxAgeSeconds: parseIntEnv(process.env.HSTS_MAX_AGE_SECONDS, 15_552_000),
    sessionMaxAgeSeconds: parseIntEnv(
      process.env.AUTH_SESSION_MAX_AGE_SECONDS,
      60 * 60 * 8
    ),
  };
  return cached;
}

/** Test helper */
export function resetSecurityConfigCache(): void {
  cached = null;
}

export function getSecurityConfigSummary(): Record<string, unknown> {
  const c = getSecurityConfig();
  return {
    enableHsts: c.enableHsts,
    enableCsp: c.enableCsp,
    cspReportOnly: c.cspReportOnly,
    enableRateLimiting: c.enableRateLimiting,
    rateLimitAuthMax: c.rateLimitAuthMax,
    rateLimitApiMax: c.rateLimitApiMax,
    rateLimitHealthMax: c.rateLimitHealthMax,
    rateLimitExpensiveMax: c.rateLimitExpensiveMax,
    hstsMaxAgeSeconds: c.hstsMaxAgeSeconds,
    sessionMaxAgeSeconds: c.sessionMaxAgeSeconds,
  };
}
