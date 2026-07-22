import type { IncidentStatus } from "@prisma/client";

/**
 * Allowed Incident status transitions (server-enforced).
 * Lifecycle: OPEN → ACKNOWLEDGED → INVESTIGATING → CONTAINED →
 * ERADICATED → RECOVERING → RESOLVED → CLOSED
 * Plus operational rollbacks (e.g. reopen).
 *
 * Case-management note: UI "TRIAGED" maps to ACKNOWLEDGED.
 * Reopen reason requirements are enforced in services (not here).
 * Do not remove OPEN→INVESTIGATING or OPEN→CLOSED — existing tests rely on them.
 */
export const ALLOWED_INCIDENT_TRANSITIONS: Record<
  IncidentStatus,
  IncidentStatus[]
> = {
  OPEN: ["ACKNOWLEDGED", "INVESTIGATING", "CLOSED"],
  ACKNOWLEDGED: ["INVESTIGATING", "OPEN"],
  INVESTIGATING: ["CONTAINED", "ACKNOWLEDGED", "RESOLVED"],
  CONTAINED: ["ERADICATED", "INVESTIGATING"],
  ERADICATED: ["RECOVERING", "CONTAINED"],
  RECOVERING: ["RESOLVED", "ERADICATED", "INVESTIGATING"],
  RESOLVED: ["CLOSED", "INVESTIGATING"],
  CLOSED: ["INVESTIGATING"],
};

/** Statuses counted as "open" (exclude terminal resolved/closed). */
export const OPEN_INCIDENT_STATUSES: IncidentStatus[] = [
  "OPEN",
  "ACKNOWLEDGED",
  "INVESTIGATING",
  "CONTAINED",
  "ERADICATED",
  "RECOVERING",
];

/** Primary forward action label for UI (one recommended next step). */
export const INCIDENT_STATUS_ACTIONS: Partial<
  Record<
    IncidentStatus,
    { to: IncidentStatus; label: string; activityHint: string }
  >
> = {
  OPEN: {
    to: "ACKNOWLEDGED",
    label: "Acknowledge",
    activityHint: "Incident acknowledged",
  },
  ACKNOWLEDGED: {
    to: "INVESTIGATING",
    label: "Start Investigation",
    activityHint: "Investigation started",
  },
  INVESTIGATING: {
    to: "CONTAINED",
    label: "Contain",
    activityHint: "Incident contained",
  },
  CONTAINED: {
    to: "ERADICATED",
    label: "Mark Eradicated",
    activityHint: "Threat eradicated",
  },
  ERADICATED: {
    to: "RECOVERING",
    label: "Start Recovery",
    activityHint: "Recovery started",
  },
  RECOVERING: {
    to: "RESOLVED",
    label: "Resolve",
    activityHint: "Incident resolved",
  },
  RESOLVED: {
    to: "CLOSED",
    label: "Close",
    activityHint: "Incident closed",
  },
};

export function assertIncidentTransition(
  from: IncidentStatus,
  to: IncidentStatus
): void {
  if (from === to) return;
  const allowed = ALLOWED_INCIDENT_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(
      `Invalid status transition: ${from} → ${to}. Allowed: ${allowed.join(", ") || "none"}`
    );
  }
}

export function isOpenIncidentStatus(status: IncidentStatus): boolean {
  return OPEN_INCIDENT_STATUSES.includes(status);
}
