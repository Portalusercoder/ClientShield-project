/**
 * Shared error helpers + safe client mapping (Phase 6P2).
 * Log full internal details; return safe client responses.
 */
import {
  AppError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  normalizeError,
  type AppErrorCode,
} from "./errors-core";
import { logger } from "./logger";
import { metrics } from "./metrics";

export {
  AppError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  normalizeError,
};
export type { AppErrorCode };

export interface ClientErrorBody {
  success: false;
  error: string;
  code: AppErrorCode;
  requestId?: string;
}

export interface SafeErrorResult {
  client: ClientErrorBody;
  httpStatus: number;
  appError: AppError;
}

/**
 * Normalize any thrown value → AppError, log internals, return safe client payload.
 */
export function toSafeError(
  error: unknown,
  opts?: { requestId?: string; action?: string }
): SafeErrorResult {
  const appError = normalizeError(error);

  if (appError.code === "UNEXPECTED_ERROR" || appError.httpStatus >= 500) {
    metrics.inc("errors");
  }

  logger.error("request.error", {
    action: opts?.action,
    code: appError.code,
    httpStatus: appError.httpStatus,
    err: appError,
    ...(appError.details ? { details: appError.details } : {}),
  });

  const safeMessage =
    appError.httpStatus >= 500
      ? "An unexpected error occurred"
      : appError.safeMessage;

  return {
    appError,
    httpStatus: appError.httpStatus,
    client: {
      success: false,
      error: safeMessage,
      code: appError.httpStatus >= 500 ? "UNEXPECTED_ERROR" : appError.code,
      ...(opts?.requestId ? { requestId: opts.requestId } : {}),
    },
  };
}

/** Map to ActionResult-style error string (no stack leak). */
export function toActionErrorMessage(error: unknown): string {
  const appError = normalizeError(error);
  if (appError.httpStatus >= 500) return "An unexpected error occurred";
  return appError.safeMessage;
}
