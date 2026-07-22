/**
 * ClientShield Security Posture Score — documented constants.
 *
 * This is NOT a certification, penetration-test score, compliance score,
 * or guarantee that an asset is free from vulnerabilities.
 *
 * Score range: 0–100 (higher = better posture).
 * Primary input: Findings (not FindingInstances counted linearly).
 * Passive Scan.overallScore is shown separately and not double-counted.
 */

import type {
  AssetCriticality,
  FindingSeverity,
  FindingStatus,
} from "@prisma/client";

export const POSTURE_SCORE_BASE = 100;

/** Severity deduction weights (validated finding baseline). */
export const SEVERITY_WEIGHTS: Record<FindingSeverity, number> = {
  CRITICAL: 25,
  HIGH: 15,
  MEDIUM: 7,
  LOW: 2,
  INFO: 0,
};

/**
 * Lifecycle multipliers — OPEN scanner observations have provisional impact only.
 * VALIDATED findings carry full weight.
 */
export const LIFECYCLE_MULTIPLIERS: Record<FindingStatus, number> = {
  OPEN: 0.25,
  VALIDATED: 1.0,
  IN_PROGRESS: 0.75,
  ACCEPTED_RISK: 0.5,
  FALSE_POSITIVE: 0,
  RESOLVED: 0,
};

/** Asset criticality multipliers applied per finding deduction. */
export const ASSET_CRITICALITY_MULTIPLIERS: Record<AssetCriticality, number> = {
  CRITICAL: 1.5,
  HIGH: 1.25,
  MEDIUM: 1.0,
  LOW: 0.75,
};

/**
 * Instance exposure modifier (capped).
 * Do NOT multiply severity linearly by instance count.
 */
export function exposureModifier(instanceCount: number): number {
  const n = Math.max(1, instanceCount);
  if (n === 1) return 1.0;
  if (n <= 10) return 1.1;
  if (n <= 50) return 1.2;
  return 1.3;
}

/** Client rollup weights by asset criticality. */
export const CLIENT_ASSET_WEIGHTS: Record<AssetCriticality, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};
