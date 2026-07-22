import type { CorrelationConfidence } from "@prisma/client";
import {
  isPrivateOrLocalIp,
  isWeakProcess,
  normalizeHash,
  normalizeIp,
  normalizeProcess,
  normalizeUsername,
} from "@/services/investigations/observable-normalize";
import type { CorrelationScoreResult } from "@/types/investigations";
import { serverEnv } from "@/lib/env";

export type ScoringEventSnapshot = {
  id: string;
  assetId: string | null;
  agentId: string | null;
  sourceIp: string | null;
  destinationIp: string | null;
  username: string | null;
  processName: string | null;
  correlationKey: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  mitreTactics: unknown;
  mitreTechniques: unknown;
  /** Normalized FILE_HASH values linked to this event. */
  fileHashes: string[];
};

const CONFIDENCE_THRESHOLDS = {
  HIGH: 70,
  MEDIUM: 50,
  LOW: 35,
} as const;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function orderEventIds(a: string, b: string): [string, string] {
  return orderedPair(a, b);
}

export function confidenceFromScore(
  score: number
): CorrelationConfidence | null {
  if (score >= CONFIDENCE_THRESHOLDS.HIGH) return "HIGH";
  if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) return "MEDIUM";
  if (score >= CONFIDENCE_THRESHOLDS.LOW) return "LOW";
  return null;
}

export function meetsMinConfidence(
  confidence: CorrelationConfidence | null
): boolean {
  if (!confidence) return false;
  const min = serverEnv.INVESTIGATION_MIN_CONFIDENCE;
  const rank = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;
  return rank[confidence] >= rank[min];
}

/**
 * Deterministic, explainable cross-event correlation scoring.
 * Does not mutate inputs. Returns null confidence when below threshold or
 * when eligibility rules fail.
 */
export function scoreEventPair(
  left: ScoringEventSnapshot,
  right: ScoringEventSnapshot,
  windowHours: number
): CorrelationScoreResult {
  const reasons: string[] = [];
  let score = 0;
  let signalCount = 0;
  let hasHashSignal = false;
  let hasAssetAndTime = false;

  if (left.id === right.id) {
    return {
      score: 0,
      confidence: null,
      reasons: [],
      signalCount: 0,
      hasHashSignal: false,
      hasAssetAndTime: false,
    };
  }

  // Same correlationKey alone is occurrence correlation — skip pairing
  // only when that is the sole relationship (checked after scoring via signals).

  if (left.assetId && right.assetId && left.assetId === right.assetId) {
    score += 40;
    signalCount += 1;
    reasons.push("Same mapped asset");
  }

  if (left.agentId && right.agentId && left.agentId === right.agentId) {
    score += 35;
    signalCount += 1;
    reasons.push("Same Wazuh agent");
  }

  const srcA = normalizeIp(left.sourceIp);
  const srcB = normalizeIp(right.sourceIp);
  if (srcA && srcB && srcA === srcB) {
    const priv = isPrivateOrLocalIp(srcA);
    score += priv ? 20 : 30;
    signalCount += 1;
    reasons.push(
      priv
        ? "Same private/source IP (internal correlation)"
        : "Same public source IP"
    );
  }

  const dstA = normalizeIp(left.destinationIp);
  const dstB = normalizeIp(right.destinationIp);
  if (dstA && dstB && dstA === dstB) {
    const priv = isPrivateOrLocalIp(dstA);
    score += priv ? 10 : 20;
    signalCount += 1;
    reasons.push(
      priv
        ? "Same private destination IP (internal correlation)"
        : "Same public destination IP"
    );
  }

  const userA = normalizeUsername(left.username);
  const userB = normalizeUsername(right.username);
  if (userA && userB && userA === userB) {
    score += 25;
    signalCount += 1;
    reasons.push("Same username");
  }

  const procA = normalizeProcess(left.processName);
  const procB = normalizeProcess(right.processName);
  if (procA && procB && procA === procB) {
    if (isWeakProcess(procA)) {
      score += 5;
      signalCount += 1;
      reasons.push("Same generic process (weak signal)");
    } else {
      score += 20;
      signalCount += 1;
      reasons.push("Same process name");
    }
  }

  const hashesA = new Set(
    left.fileHashes.map((h) => normalizeHash(h)).filter(Boolean) as string[]
  );
  const hashesB = new Set(
    right.fileHashes.map((h) => normalizeHash(h)).filter(Boolean) as string[]
  );
  let sharedHash = false;
  for (const h of hashesA) {
    if (hashesB.has(h)) {
      sharedHash = true;
      break;
    }
  }
  if (sharedHash) {
    score += 50;
    signalCount += 1;
    hasHashSignal = true;
    reasons.push("Shared file hash");
  }

  const techA = new Set(asStringArray(left.mitreTechniques).map((t) => t.toUpperCase()));
  const techB = new Set(asStringArray(right.mitreTechniques).map((t) => t.toUpperCase()));
  let sharedTech = 0;
  for (const t of techA) {
    if (techB.has(t)) sharedTech += 1;
  }
  if (sharedTech > 0) {
    const techPoints = Math.min(30, sharedTech * 15);
    score += techPoints;
    signalCount += 1;
    reasons.push(
      sharedTech === 1
        ? `Shared MITRE technique (${[...techA].find((t) => techB.has(t))})`
        : `Shared ${sharedTech} MITRE techniques`
    );
  } else {
    const tacA = new Set(asStringArray(left.mitreTactics).map((t) => t.toLowerCase()));
    const tacB = new Set(asStringArray(right.mitreTactics).map((t) => t.toLowerCase()));
    let sharedTac = false;
    for (const t of tacA) {
      if (tacB.has(t)) {
        sharedTac = true;
        break;
      }
    }
    if (sharedTac) {
      score += 5;
      signalCount += 1;
      reasons.push("Shared MITRE tactic only (weak)");
    }
  }

  const windowMs = windowHours * 60 * 60 * 1000;
  const midA =
    (left.firstSeenAt.getTime() + left.lastSeenAt.getTime()) / 2;
  const midB =
    (right.firstSeenAt.getTime() + right.lastSeenAt.getTime()) / 2;
  const delta = Math.abs(midA - midB);
  const withinWindow = delta <= windowMs;
  if (withinWindow) {
    score += 10;
    reasons.push(`Within ${windowHours}h temporal window`);
    if (delta <= 30 * 60 * 1000) {
      score += 5;
      reasons.push("Within 30 minutes of each other");
    }
  }

  if (
    left.assetId &&
    right.assetId &&
    left.assetId === right.assetId &&
    withinWindow
  ) {
    hasAssetAndTime = true;
  }

  // Eligibility: at least 2 distinct signals OR hash OR (asset+time)
  const eligible =
    signalCount >= 2 || hasHashSignal || hasAssetAndTime;

  // Skip pairs that only share the same correlationKey with no other signal —
  // those are already covered by occurrence correlation.
  if (
    left.correlationKey === right.correlationKey &&
    signalCount <= 1 &&
    !hasHashSignal
  ) {
    return {
      score: 0,
      confidence: null,
      reasons: [],
      signalCount,
      hasHashSignal,
      hasAssetAndTime,
    };
  }

  if (!eligible) {
    return {
      score,
      confidence: null,
      reasons,
      signalCount,
      hasHashSignal,
      hasAssetAndTime,
    };
  }

  if (!withinWindow && !hasHashSignal) {
    // Temporal window is required unless hash links them
    return {
      score,
      confidence: null,
      reasons,
      signalCount,
      hasHashSignal,
      hasAssetAndTime,
    };
  }

  const confidence = confidenceFromScore(score);
  return {
    score,
    confidence,
    reasons,
    signalCount,
    hasHashSignal,
    hasAssetAndTime,
  };
}

export { CONFIDENCE_THRESHOLDS };
