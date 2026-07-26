/**
 * Attention queue eligibility rules (Phase 6b3).
 * Eligibility is always derived from source records — overlay never resurrects.
 */
import type { AttentionSourceType, InvestigationStatus } from "@prisma/client";
import { OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import { UNRESOLVED_FINDING_STATUSES } from "@/types/findings";
import { ATTENTION_QUEUE_RULES } from "@/lib/ownership/model";

export { ATTENTION_QUEUE_RULES };

export const ATTENTION_SE_ELIGIBLE = {
  classification: "ACTIONABLE" as const,
  severity: ["CRITICAL", "HIGH"] as const,
  status: ["NEW", "REVIEWING"] as const,
};

export const ATTENTION_INV_ELIGIBLE_STATUSES: InvestigationStatus[] = [
  "OPEN",
  "INVESTIGATING",
  "IN_PROGRESS",
  "PENDING",
  "CONFIRMED",
];

export const ATTENTION_FINDING_ELIGIBLE_STATUSES = UNRESOLVED_FINDING_STATUSES;
export const ATTENTION_INCIDENT_ELIGIBLE_STATUSES = OPEN_INCIDENT_STATUSES;

/**
 * Human-readable eligibility summary for analysts / docs / UI help.
 */
export function describeAttentionQueueBehaviour(
  sourceType: AttentionSourceType
): string {
  switch (sourceType) {
    case "SECURITY_EVENT":
      return "In queue when ACTIONABLE + CRITICAL/HIGH + NEW/REVIEWING. Triage Acknowledge (status) removes from queue. Attention Acknowledge / Claim do not.";
    case "FINDING":
      return "In queue when CRITICAL/HIGH and unresolved. Formal Assign is ownership (Attention Claim delegates to Assign). Acknowledge does not remove.";
    case "INVESTIGATION":
      return "In queue when CRITICAL/HIGH and OPEN/IN_PROGRESS/PENDING/CONFIRMED (incl. legacy INVESTIGATING). Claim is a work lock; Assign is formal ownership — independent. RESOLVED/CLOSED/DISMISSED/LINKED leave queue.";
    case "INCIDENT":
      return "In queue when CRITICAL/HIGH and open lifecycle statuses. Formal Assign is ownership (Attention Claim delegates to Assign). RESOLVED/CLOSED leave queue.";
    default:
      return "Eligibility is derived from source severity and status.";
  }
}
