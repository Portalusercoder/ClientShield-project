import { AppError } from "@/lib/observability/errors-core";
import {
  actionFail,
  actionOk,
  type ActionResult,
} from "@/types/action-result";

export { actionFail, actionOk };
export type { ActionResult };

/**
 * Map unknown thrown values to a safe ActionResult error.
 *
 * - AppError → safeMessage (hides unexpected/internal details)
 * - other Error → message (preserves existing domain throw contracts)
 * - unknown → generic fallback
 */
export function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof AppError) {
    if (error.httpStatus >= 500) {
      return actionFail("An unexpected error occurred");
    }
    return actionFail(error.safeMessage);
  }
  if (error instanceof Error) {
    return actionFail(error.message || "An unexpected error occurred");
  }
  return actionFail("An unexpected error occurred");
}

/** First Zod issue message, or a fallback. */
export function zodFirstError(
  error: { errors: { message?: string }[] },
  fallback = "Validation failed"
): string {
  return error.errors[0]?.message ?? fallback;
}
