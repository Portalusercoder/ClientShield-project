/**
 * Timing helpers (Phase 6P2).
 */
import { getObservabilityConfig } from "./config";
import { logger } from "./logger";

export async function withTiming<T>(
  action: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    if (getObservabilityConfig().enableRequestLogging) {
      logger.info("timing.completed", {
        action,
        durationMs,
        ...meta,
      });
    } else {
      logger.debug("timing.completed", { action, durationMs, ...meta });
    }
    return result;
  } catch (error) {
    const durationMs = Date.now() - start;
    logger.error("timing.failed", {
      action,
      durationMs,
      err: error instanceof Error ? error : new Error(String(error)),
      ...meta,
    });
    throw error;
  }
}

export function startTimer(): { elapsedMs: () => number } {
  const start = Date.now();
  return { elapsedMs: () => Date.now() - start };
}

/** Log when a DB-like operation exceeds the slow-query threshold. */
export function maybeLogSlowQuery(input: {
  model?: string;
  operation?: string;
  durationMs: number;
}): void {
  const threshold = getObservabilityConfig().slowQueryMs;
  if (input.durationMs < threshold) return;
  logger.warn("db.slow_query", {
    action: "prisma.query",
    model: input.model,
    operation: input.operation,
    durationMs: input.durationMs,
    thresholdMs: threshold,
  });
}
