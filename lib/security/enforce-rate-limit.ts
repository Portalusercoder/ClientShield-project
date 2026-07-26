/**
 * Rate-limit enforcement helpers (Phase 6P3).
 */
import { getSecurityConfig } from "./config";
import {
  buildRateLimitKey,
  checkRateLimit,
  type RateLimitBucket,
  type RateLimitResult,
} from "./rate-limit";
import { logSecurityEvent } from "./security-log";

export class RateLimitError extends Error {
  readonly status = 429;
  readonly result: RateLimitResult;

  constructor(result: RateLimitResult, message = "Too many requests") {
    super(message);
    this.name = "RateLimitError";
    this.result = result;
  }
}

function limitsFor(
  bucket: RateLimitBucket
): { limit: number; windowMs: number } {
  const c = getSecurityConfig();
  switch (bucket) {
    case "auth":
      return { limit: c.rateLimitAuthMax, windowMs: c.rateLimitAuthWindowMs };
    case "health":
      return {
        limit: c.rateLimitHealthMax,
        windowMs: c.rateLimitHealthWindowMs,
      };
    case "expensive":
      return {
        limit: c.rateLimitExpensiveMax,
        windowMs: c.rateLimitExpensiveWindowMs,
      };
    case "action":
    case "api":
    default:
      return { limit: c.rateLimitApiMax, windowMs: c.rateLimitApiWindowMs };
  }
}

export function assertRateLimit(input: {
  bucket: RateLimitBucket;
  ip?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  action?: string | null;
}): RateLimitResult {
  const cfg = getSecurityConfig();
  if (!cfg.enableRateLimiting) {
    return {
      allowed: true,
      limit: 0,
      remaining: 0,
      resetAt: Date.now(),
      retryAfterSeconds: 0,
    };
  }

  const { limit, windowMs } = limitsFor(input.bucket);
  const key = buildRateLimitKey(input);
  const result = checkRateLimit({ key, limit, windowMs });

  if (!result.allowed) {
    logSecurityEvent({
      type: "rate_limit_exceeded",
      severity: "warn",
      message: "Rate limit exceeded",
      meta: {
        bucket: input.bucket,
        action: input.action ?? null,
        limit: result.limit,
        retryAfterSeconds: result.retryAfterSeconds,
        // Never log full IP in production logs if sensitive — truncated
        ipSuffix: input.ip ? String(input.ip).slice(-8) : null,
        userId: input.userId ?? null,
        organizationId: input.organizationId ?? null,
      },
    });
    throw new RateLimitError(result);
  }

  return result;
}

export function classifyPathBucket(pathname: string): RateLimitBucket {
  if (pathname.startsWith("/api/health")) return "health";
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/login")) {
    return "auth";
  }
  if (pathname.startsWith("/api/")) return "api";
  return "api";
}
