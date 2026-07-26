/**
 * In-memory sliding-window rate limiter (Phase 6P3).
 * Process-local — not shared across replicas (documented limitation).
 * Edge-safe (no Node-only APIs).
 */

export type RateLimitBucket =
  | "auth"
  | "api"
  | "health"
  | "expensive"
  | "action";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

const store = new Map<string, WindowState>();

/** Max keys to retain (prevent unbounded growth). */
const MAX_KEYS = 20_000;

export function resetRateLimitStore(): void {
  store.clear();
}

function pruneIfNeeded(): void {
  if (store.size < MAX_KEYS) return;
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.resetAt <= now) store.delete(k);
  }
  if (store.size < MAX_KEYS) return;
  // Drop oldest ~10%
  let i = 0;
  const drop = Math.floor(MAX_KEYS * 0.1);
  for (const k of store.keys()) {
    store.delete(k);
    i += 1;
    if (i >= drop) break;
  }
}

export function checkRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}): RateLimitResult {
  pruneIfNeeded();
  const now = input.now ?? Date.now();
  const existing = store.get(input.key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + input.windowMs;
    store.set(input.key, { count: 1, resetAt });
    return {
      allowed: true,
      limit: input.limit,
      remaining: Math.max(0, input.limit - 1),
      resetAt,
      retryAfterSeconds: Math.ceil(input.windowMs / 1000),
    };
  }

  existing.count += 1;
  const allowed = existing.count <= input.limit;
  return {
    allowed,
    limit: input.limit,
    remaining: Math.max(0, input.limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((existing.resetAt - now) / 1000)
    ),
  };
}

export function buildRateLimitKey(parts: {
  bucket: RateLimitBucket;
  ip?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  action?: string | null;
}): string {
  return [
    parts.bucket,
    parts.ip?.trim() || "ip:unknown",
    parts.userId ? `u:${parts.userId}` : "u:anon",
    parts.organizationId ? `o:${parts.organizationId}` : "o:none",
    parts.action ? `a:${parts.action}` : "a:default",
  ].join("|");
}
