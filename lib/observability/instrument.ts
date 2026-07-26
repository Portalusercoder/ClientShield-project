/**
 * High-level instrumentation helpers (Phase 6P2).
 */
import { headers } from "next/headers";
import {
  bindObservabilityContext,
  createObservabilityContext,
  getObservabilityContext,
  runWithObservabilityContext,
} from "./context";
import { toActionErrorMessage, toSafeError } from "./errors";
import { logger } from "./logger";
import { metrics } from "./metrics";
import { withTiming } from "./timing";
import type { ObservabilityContext } from "./types";

export const REQUEST_ID_HEADER = "x-request-id";
export const CORRELATION_ID_HEADER = "x-correlation-id";

/** Establish context from Next.js request headers (Server Actions / Route Handlers). */
export async function establishRequestContextFromHeaders(
  partial?: Partial<ObservabilityContext>
): Promise<ObservabilityContext> {
  let requestId: string | undefined;
  let correlationId: string | undefined;
  try {
    const h = await headers();
    requestId = h.get(REQUEST_ID_HEADER) ?? undefined;
    correlationId = h.get(CORRELATION_ID_HEADER) ?? undefined;
  } catch {
    // headers() unavailable outside a request (workers / scripts)
  }
  return bindObservabilityContext({
    requestId,
    correlationId,
    service: "clientshield",
    ...partial,
  });
}

/**
 * Wrap a Server Action with request context, metrics, and timing.
 * Does not change business return shapes.
 */
export function withServerAction<TArgs extends unknown[], TResult>(
  actionName: string,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    await establishRequestContextFromHeaders({
      action: actionName,
      service: "server-action",
    });
    metrics.inc("requests");
    try {
      return await withTiming(`server_action.${actionName}`, () => fn(...args), {
        action: actionName,
      });
    } catch (error) {
      metrics.inc("errors");
      const ctx = getObservabilityContext();
      toSafeError(error, {
        requestId: ctx?.requestId,
        action: actionName,
      });
      throw error;
    }
  };
}

/**
 * Convenience for actions that return `{ success, error }` instead of throwing.
 */
export async function runServerActionResult<T>(
  actionName: string,
  fn: () => Promise<{ success: true; data?: T } | { success: false; error: string }>
): Promise<{ success: true; data?: T } | { success: false; error: string }> {
  await establishRequestContextFromHeaders({
    action: actionName,
    service: "server-action",
  });
  metrics.inc("requests");
  try {
    return await withTiming(`server_action.${actionName}`, fn, {
      action: actionName,
    });
  } catch (error) {
    metrics.inc("errors");
    const ctx = getObservabilityContext();
    toSafeError(error, { requestId: ctx?.requestId, action: actionName });
    return { success: false, error: toActionErrorMessage(error) };
  }
}

/** Worker run wrapper — start/finish/duration/failure. */
export async function withWorkerRun<T>(
  input: {
    service: string;
    action: string;
    workerId: string;
    organizationId?: string;
  },
  fn: () => Promise<T>
): Promise<T> {
  return runWithObservabilityContext(
    {
      service: input.service,
      action: input.action,
      workerId: input.workerId,
      organizationId: input.organizationId,
      requestId: createObservabilityContext().requestId,
    },
    async () => {
      metrics.inc("worker_runs");
      const start = Date.now();
      logger.info("worker.run.start", {
        action: input.action,
        workerId: input.workerId,
      });
      try {
        const result = await fn();
        logger.info("worker.run.finish", {
          action: input.action,
          workerId: input.workerId,
          durationMs: Date.now() - start,
        });
        return result;
      } catch (error) {
        metrics.inc("worker_failures");
        logger.error("worker.run.failed", {
          action: input.action,
          workerId: input.workerId,
          durationMs: Date.now() - start,
          err: error instanceof Error ? error : new Error(String(error)),
        });
        throw error;
      }
    }
  );
}

/** API route wrapper. */
export async function withApiRoute<T>(
  actionName: string,
  fn: () => Promise<T>
): Promise<T> {
  await establishRequestContextFromHeaders({
    action: actionName,
    service: "api",
  });
  metrics.inc("requests");
  return withTiming(`api.${actionName}`, fn, { action: actionName });
}
