/**
 * Destructive-operation safeguards (Phase 6P3).
 * No org hard-delete exists in product code — keep it that way.
 */
import { z } from "zod";
import { logSecurityEvent } from "./security-log";

/** Confirmation phrases for high-impact soft-destructive actions. */
export const DESTRUCTIVE_CONFIRM = {
  CLIENT_OFFBOARD: "OFFBOARD",
  ASSET_ARCHIVE: "ARCHIVE",
  USER_DISABLE: "DISABLE",
} as const;

export const destructiveConfirmSchema = z.object({
  confirm: z.string().trim().min(1).max(64),
});

export function assertDestructiveConfirmation(input: {
  expected: string;
  provided: string | undefined | null;
  action: string;
  organizationId?: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
}): void {
  const provided = (input.provided ?? "").trim();
  if (provided !== input.expected) {
    logSecurityEvent({
      type: "destructive_blocked",
      severity: "warn",
      message: "Destructive action blocked — confirmation mismatch",
      meta: {
        action: input.action,
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
      },
    });
    throw new Error(
      `Confirmation required: type "${input.expected}" to proceed`
    );
  }
}

/**
 * Organisation hard-delete is intentionally unsupported in application code.
 * Call this if any future path attempts it.
 */
export function refuseOrganizationHardDelete(context: {
  organizationId?: string;
  userId?: string;
}): never {
  logSecurityEvent({
    type: "destructive_blocked",
    severity: "error",
    message: "Organisation hard-delete refused",
    meta: context,
  });
  throw new Error(
    "Organisation hard-delete is not supported. Contact an operator for disaster recovery procedures."
  );
}
