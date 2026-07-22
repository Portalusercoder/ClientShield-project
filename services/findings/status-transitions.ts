import type { FindingStatus } from "@prisma/client";

/**
 * Allowed Finding status transitions (server-enforced).
 */
export const ALLOWED_FINDING_TRANSITIONS: Record<
  FindingStatus,
  FindingStatus[]
> = {
  OPEN: ["VALIDATED", "FALSE_POSITIVE", "ACCEPTED_RISK"],
  VALIDATED: ["IN_PROGRESS", "FALSE_POSITIVE", "ACCEPTED_RISK"],
  IN_PROGRESS: ["RESOLVED", "ACCEPTED_RISK"],
  RESOLVED: ["OPEN", "VALIDATED"],
  ACCEPTED_RISK: ["OPEN", "VALIDATED"],
  FALSE_POSITIVE: ["OPEN"],
};

export function assertFindingTransition(
  from: FindingStatus,
  to: FindingStatus
): void {
  if (from === to) return;
  const allowed = ALLOWED_FINDING_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(
      `Invalid status transition: ${from} → ${to}. Allowed: ${allowed.join(", ") || "none"}`
    );
  }
}
