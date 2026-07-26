/**
 * ClientShield unified ownership vocabulary (Phase 6b3).
 *
 * Three orthogonal concepts — never conflate them in UI or services:
 *
 * ACKNOWLEDGED — Analyst has reviewed the Attention item.
 *   Does not imply claim or assignment. Does not remove queue eligibility.
 *   Distinct from SecurityEvent.status ACKNOWLEDGED and Incident.status ACKNOWLEDGED
 *   (those are triage/lifecycle transitions that may change eligibility).
 *
 * CLAIMED — Temporary Attention work lock (who is actively working the queue item).
 *   Can be released. Does not replace formal assignment.
 *   Authoritative store: SocAttentionState.claimedByUserId for SECURITY_EVENT
 *   and INVESTIGATION. Finding/Incident have no separate claim layer — Attention
 *   "Claim" delegates to native ASSIGN (see ownershipMode).
 *
 * ASSIGNED — Formal ownership on the underlying object (accountability / SLA).
 *   Persists until changed. Independent of claim and acknowledgement.
 *   Store: Finding/Incident/InvestigationGroup.assignedToUserId.
 *   Security Events have no native assignee.
 */

import type { AttentionSourceType } from "@prisma/client";

export const OWNERSHIP_TERMS = {
  acknowledged: "Acknowledged",
  claimed: "Claimed",
  claimedBy: "Claimed by",
  unclaimed: "Unclaimed",
  claim: "Claim",
  release: "Release",
  transfer: "Transfer",
  assigned: "Assigned",
  assignedTo: "Assigned to",
  unassigned: "Unassigned",
  assign: "Assign",
  unassign: "Unassign",
  assignToMe: "Assign to me",
} as const;

export type AttentionOwnershipMode = "CLAIM_OVERLAY" | "NATIVE_ASSIGN";

/** Sources where Attention claim is a temporary overlay lock. */
export function attentionOwnershipMode(
  sourceType: AttentionSourceType
): AttentionOwnershipMode {
  if (sourceType === "FINDING" || sourceType === "INCIDENT") {
    return "NATIVE_ASSIGN";
  }
  return "CLAIM_OVERLAY";
}

/**
 * Attention queue eligibility (derived — ack/claim/assign never resurrect items).
 *
 * | State        | In queue? | Notes |
 * |--------------|----------|-------|
 * | New          | Yes      | Eligible by severity/status/classification rules |
 * | Acknowledged | Yes      | Attention ACK only; stays visible |
 * | Claimed      | Yes      | Work lock; still visible to org |
 * | Assigned     | Yes      | Formal owner; still visible |
 * | Resolved     | No*      | Investigation RESOLVED leaves attention eligibility |
 * | Closed       | No       | Terminal / not in open statuses |
 * | Dismissed    | No       | Terminal |
 *
 * *Investigation RESOLVED is not in INV_ELIGIBLE. Finding resolved statuses
 *  and Incident RESOLVED/CLOSED are excluded. SE ACKNOWLEDGED status leaves queue.
 */
export const ATTENTION_QUEUE_RULES = {
  acknowledgementRemovesFromQueue: false,
  claimRemovesFromQueue: false,
  assignmentRemovesFromQueue: false,
  personalSnoozeHidesForViewerOnly: true,
} as const;
