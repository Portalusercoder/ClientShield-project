/**
 * Stable eligibility generation fingerprints for attention overlays.
 *
 * Limitation (Phase 2): generation does not bump when the same source row
 * leaves and re-enters eligibility (e.g. Finding reopen). Acknowledgement may
 * therefore persist across same-record re-entry. A new source record always
 * gets a new generation. Do not use updatedAt.
 */
import type { AttentionSourceType } from "@prisma/client";

export function buildEligibilityGeneration(input: {
  sourceType: AttentionSourceType;
  sourceId: string;
  /** firstSeenAt / firstDetectedAt / createdAt / detectedAt */
  anchorAt: Date;
}): string {
  const iso = input.anchorAt.toISOString();
  switch (input.sourceType) {
    case "SECURITY_EVENT":
      return `se:${input.sourceId}:${iso}`;
    case "FINDING":
      return `finding:${input.sourceId}:${iso}`;
    case "INVESTIGATION":
      return `inv:${input.sourceId}:${iso}`;
    case "INCIDENT":
      return `inc:${input.sourceId}:${iso}`;
    default: {
      const _exhaustive: never = input.sourceType;
      return _exhaustive;
    }
  }
}
