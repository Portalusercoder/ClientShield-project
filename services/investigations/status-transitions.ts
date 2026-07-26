import type { InvestigationStatus } from "@prisma/client";

/**
 * Allowed Investigation status transitions (server-enforced).
 *
 * Recommended product flow:
 *   OPEN → IN_PROGRESS → PENDING → RESOLVED → CLOSED
 *   REOPEN: RESOLVED | CLOSED → IN_PROGRESS
 *
 * Legacy statuses (INVESTIGATING, CONFIRMED, DISMISSED, LINKED_TO_INCIDENT)
 * remain valid for existing data and workflows.
 */
export const ALLOWED_INVESTIGATION_TRANSITIONS: Record<
  InvestigationStatus,
  InvestigationStatus[]
> = {
  OPEN: [
    "INVESTIGATING",
    "IN_PROGRESS",
    "PENDING",
    "CONFIRMED",
    "RESOLVED",
    "DISMISSED",
    "LINKED_TO_INCIDENT",
  ],
  INVESTIGATING: [
    "IN_PROGRESS",
    "PENDING",
    "CONFIRMED",
    "RESOLVED",
    "DISMISSED",
    "LINKED_TO_INCIDENT",
  ],
  IN_PROGRESS: [
    "PENDING",
    "CONFIRMED",
    "RESOLVED",
    "DISMISSED",
    "INVESTIGATING",
    "LINKED_TO_INCIDENT",
  ],
  PENDING: [
    "IN_PROGRESS",
    "INVESTIGATING",
    "CONFIRMED",
    "RESOLVED",
    "DISMISSED",
    "LINKED_TO_INCIDENT",
  ],
  CONFIRMED: [
    "LINKED_TO_INCIDENT",
    "PENDING",
    "RESOLVED",
    "DISMISSED",
    "IN_PROGRESS",
    "INVESTIGATING",
  ],
  RESOLVED: ["CLOSED", "IN_PROGRESS", "INVESTIGATING"],
  DISMISSED: [],
  LINKED_TO_INCIDENT: [
    "RESOLVED",
    "CLOSED",
    "PENDING",
    "IN_PROGRESS",
    "INVESTIGATING",
  ],
  CLOSED: ["IN_PROGRESS", "INVESTIGATING"],
};

/** Statuses treated as actively open for metrics / attention. */
export const ACTIVE_INVESTIGATION_STATUSES: InvestigationStatus[] = [
  "OPEN",
  "INVESTIGATING",
  "IN_PROGRESS",
  "PENDING",
  "CONFIRMED",
];

/** In-progress family (legacy INVESTIGATING + recommended IN_PROGRESS). */
export const IN_PROGRESS_FAMILY: InvestigationStatus[] = [
  "INVESTIGATING",
  "IN_PROGRESS",
];

export function assertInvestigationTransition(
  from: InvestigationStatus,
  to: InvestigationStatus
): void {
  if (from === to) return;
  const allowed = ALLOWED_INVESTIGATION_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(
      `Invalid investigation status transition: ${from} → ${to}. Allowed: ${allowed.join(", ") || "none"}`
    );
  }
}

export function canReopenInvestigation(status: InvestigationStatus): boolean {
  return status === "RESOLVED" || status === "CLOSED";
}

export function isTerminalInvestigationStatus(
  status: InvestigationStatus
): boolean {
  return status === "CLOSED" || status === "DISMISSED";
}
