/**
 * Shared application error classes (Phase 6P2).
 * Safe to import without pulling the logger (avoids Edge/client bundling issues).
 */

export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "APPLICATION_ERROR"
  | "UNEXPECTED_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly httpStatus: number;
  readonly safeMessage: string;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    code: AppErrorCode;
    message: string;
    safeMessage?: string;
    httpStatus?: number;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "AppError";
    this.code = input.code;
    this.safeMessage = input.safeMessage ?? input.message;
    this.httpStatus = input.httpStatus ?? defaultStatus(input.code);
    this.details = input.details;
    if (input.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = input.cause;
    }
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: "VALIDATION_ERROR",
      message,
      safeMessage: message,
      httpStatus: 400,
      details,
    });
    this.name = "ValidationError";
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Unauthorized") {
    super({
      code: "AUTHORIZATION_ERROR",
      message,
      safeMessage: "Unauthorized",
      httpStatus: 401,
    });
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super({
      code: "NOT_FOUND",
      message,
      safeMessage: message,
      httpStatus: 404,
    });
    this.name = "NotFoundError";
  }
}

function defaultStatus(code: AppErrorCode): number {
  switch (code) {
    case "VALIDATION_ERROR":
      return 400;
    case "AUTHORIZATION_ERROR":
      return 401;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    default:
      return 500;
  }
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof Error) {
    if (error.message === "Unauthorized") {
      return new AuthorizationError(error.message);
    }
    return new AppError({
      code: "UNEXPECTED_ERROR",
      message: error.message,
      safeMessage: "An unexpected error occurred",
      httpStatus: 500,
      cause: error,
    });
  }

  return new AppError({
    code: "UNEXPECTED_ERROR",
    message: String(error),
    safeMessage: "An unexpected error occurred",
    httpStatus: 500,
  });
}
