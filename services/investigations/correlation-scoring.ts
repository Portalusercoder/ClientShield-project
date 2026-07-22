/**
 * Cross-event correlation quality scoring.
 *
 * Quality over quantity: same asset/agent alone must NOT create campaigns.
 * Signal families prevent double-counting related context (asset+agent).
 */
import type {
  CorrelationConfidence,
  SecurityEventClassification,
} from "@prisma/client";
import { serverEnv } from "@/lib/env";
import {
  isPrivateOrLocalIp,
  isWeakProcess,
  normalizeHash,
  normalizeIp,
  normalizeProcess,
  normalizeUsername,
} from "@/services/investigations/observable-normalize";
import { SCA_NOISY_RULE_IDS } from "@/services/wazuh/wazuh-classification.service";
import type { CorrelationScoreResult } from "@/types/investigations";

export type SignalFamily =
  | "ASSET_CONTEXT"
  | "NETWORK"
  | "IDENTITY"
  | "PROCESS"
  | "FILE"
  | "THREAT_INTEL"
  | "MITRE"
  | "TEMPORAL"
  | "SCA";

export type SignalStrength =
  | "VERY_STRONG"
  | "STRONG"
  | "MEDIUM"
  | "WEAK"
  | "SUPPORTING";

export type ScoringEventSnapshot = {
  id: string;
  assetId: string | null;
  agentId: string | null;
  sourceIp: string | null;
  destinationIp: string | null;
  username: string | null;
  processName: string | null;
  filePath: string | null;
  correlationKey: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  mitreTactics: unknown;
  mitreTechniques: unknown;
  fileHashes: string[];
  classification: SecurityEventClassification;
  ruleId: string | null;
  ruleGroups: unknown;
  scaCheckId: string | null;
  title: string | null;
  severity: string | null;
  /** Optional TI risk when a SUCCESS lookup already exists (never inferred). */
  threatIntelRisk?: "MALICIOUS" | "HIGH" | null;
};

const CONFIDENCE_THRESHOLDS = {
  HIGH: 70,
  MEDIUM: 50,
  LOW: 35,
} as const;

/** High-volume endpoint hygiene rules that rarely indicate a campaign alone. */
const ROUTINE_ENDPOINT_RULE_IDS = new Set([
  "533", // listened ports changed
  "510", // rootcheck anomaly (often noisy locally)
]);

type ScoredSignal = {
  family: SignalFamily;
  strength: SignalStrength;
  points: number;
  reason: string;
};

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

export function confidenceRank(c: CorrelationConfidence | null): number {
  if (!c) return 0;
  return { LOW: 1, MEDIUM: 2, HIGH: 3 }[c];
}

/** Candidate persistence threshold (separate from investigation suggestion). */
export function meetsCandidateMinConfidence(
  confidence: CorrelationConfidence | null
): boolean {
  if (!confidence) return false;
  const min = serverEnv.INVESTIGATION_CANDIDATE_MIN_CONFIDENCE;
  return confidenceRank(confidence) >= confidenceRank(min);
}

/** @deprecated Prefer meetsCandidateMinConfidence */
export function meetsMinConfidence(
  confidence: CorrelationConfidence | null
): boolean {
  return meetsCandidateMinConfidence(confidence);
}

export function isScaLikeEvent(event: ScoringEventSnapshot): boolean {
  if (event.scaCheckId) return true;
  if (event.ruleId && SCA_NOISY_RULE_IDS.has(event.ruleId)) return true;
  if (event.ruleId === "19003") return true;
  const groups = asStringArray(event.ruleGroups).map((g) => g.toLowerCase());
  if (groups.some((g) => g.includes("sca") || g.includes("cis"))) return true;
  const title = (event.title ?? "").toLowerCase();
  return title.includes("cis_") || title.startsWith("sca ");
}

export function isRoutineEndpointRule(ruleId: string | null): boolean {
  return Boolean(ruleId && ROUTINE_ENDPOINT_RULE_IDS.has(ruleId));
}

function effectiveClassification(
  event: ScoringEventSnapshot
): SecurityEventClassification {
  // Treat known SCA noisy rules as NOISY for correlation even if historical
  // rows were stored as ACTIONABLE before classification matured.
  if (event.ruleId && SCA_NOISY_RULE_IDS.has(event.ruleId)) return "NOISY";
  if (event.classification === "IGNORED") return "IGNORED";
  if (
    isRoutineEndpointRule(event.ruleId) &&
    event.classification === "ACTIONABLE"
  ) {
    // Soft-downgrade for correlation only — does not mutate stored classification.
    return "INFORMATIONAL";
  }
  return event.classification;
}

function classificationMultiplier(c: SecurityEventClassification): number {
  switch (c) {
    case "ACTIONABLE":
      return 1;
    case "INFORMATIONAL":
      return 0.55;
    case "NOISY":
      return 0.2;
    case "IGNORED":
      return 0;
    default:
      return 0.5;
  }
}

function pairClassificationMultiplier(
  a: SecurityEventClassification,
  b: SecurityEventClassification
): number {
  return Math.min(classificationMultiplier(a), classificationMultiplier(b));
}

/**
 * Deterministic, explainable cross-event correlation scoring (quality model).
 */
export function scoreEventPair(
  left: ScoringEventSnapshot,
  right: ScoringEventSnapshot,
  windowHours: number
): CorrelationScoreResult {
  const empty = (
    partial?: Partial<CorrelationScoreResult>
  ): CorrelationScoreResult => ({
    score: 0,
    confidence: null,
    reasons: [],
    signalCount: 0,
    hasHashSignal: false,
    hasAssetAndTime: false,
    hasVeryStrongSignal: false,
    signalFamilies: [],
    independentFamilyCount: 0,
    qualityFactors: [],
    riskFactors: [],
    strongSignals: [],
    supportingSignals: [],
    ...partial,
  });

  if (left.id === right.id) return empty();

  const classA = effectiveClassification(left);
  const classB = effectiveClassification(right);

  if (classA === "IGNORED" || classB === "IGNORED") {
    return empty({
      riskFactors: [
        "One or both events are IGNORED — excluded from correlation",
      ],
    });
  }

  const signals: ScoredSignal[] = [];
  const qualityFactors: string[] = [];
  const riskFactors: string[] = [];

  // --- ASSET_CONTEXT (asset + agent = one family, capped) ---
  const sameAsset = Boolean(
    left.assetId && right.assetId && left.assetId === right.assetId
  );
  const sameAgent = Boolean(
    left.agentId && right.agentId && left.agentId === right.agentId
  );
  if (sameAsset || sameAgent) {
    const reasons: string[] = [];
    if (sameAsset) reasons.push("Same mapped asset");
    if (sameAgent) reasons.push("Same Wazuh agent");
    signals.push({
      family: "ASSET_CONTEXT",
      strength: "WEAK",
      points: sameAsset && sameAgent ? 18 : 14,
      reason: reasons.join("; "),
    });
  }

  // --- NETWORK ---
  const srcA = normalizeIp(left.sourceIp);
  const srcB = normalizeIp(right.sourceIp);
  if (srcA && srcB && srcA === srcB) {
    if (srcA === "127.0.0.1" || srcA === "::1") {
      riskFactors.push("Shared loopback IP ignored as network signal");
    } else if (isPrivateOrLocalIp(srcA)) {
      signals.push({
        family: "NETWORK",
        strength: "SUPPORTING",
        points: 6,
        reason: "Same private source IP (supporting only)",
      });
    } else {
      signals.push({
        family: "NETWORK",
        strength: "STRONG",
        points: 28,
        reason: "Same public source IP",
      });
    }
  }

  const dstA = normalizeIp(left.destinationIp);
  const dstB = normalizeIp(right.destinationIp);
  if (dstA && dstB && dstA === dstB) {
    if (dstA !== "127.0.0.1" && dstA !== "::1") {
      if (isPrivateOrLocalIp(dstA)) {
        signals.push({
          family: "NETWORK",
          strength: "SUPPORTING",
          points: 4,
          reason: "Same private destination IP (supporting only)",
        });
      } else {
        signals.push({
          family: "NETWORK",
          strength: "MEDIUM",
          points: 16,
          reason: "Same public destination IP",
        });
      }
    }
  }

  // --- IDENTITY ---
  const userA = normalizeUsername(left.username);
  const userB = normalizeUsername(right.username);
  if (userA && userB && userA === userB) {
    signals.push({
      family: "IDENTITY",
      strength: "MEDIUM",
      points: 22,
      reason: "Same username",
    });
  }

  // --- PROCESS ---
  const procA = normalizeProcess(left.processName);
  const procB = normalizeProcess(right.processName);
  if (procA && procB && procA === procB) {
    if (isWeakProcess(procA)) {
      signals.push({
        family: "PROCESS",
        strength: "SUPPORTING",
        points: 4,
        reason: "Same generic process (weak)",
      });
    } else {
      signals.push({
        family: "PROCESS",
        strength: "MEDIUM",
        points: 18,
        reason: "Same process name",
      });
    }
  }

  // --- FILE ---
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
    signals.push({
      family: "FILE",
      strength: "VERY_STRONG",
      points: 50,
      reason: "Shared file hash",
    });
  } else if (
    left.filePath &&
    right.filePath &&
    left.filePath === right.filePath &&
    procA &&
    procB &&
    procA === procB &&
    !isWeakProcess(procA)
  ) {
    signals.push({
      family: "FILE",
      strength: "STRONG",
      points: 26,
      reason: "Same file path + process combination",
    });
  }

  // --- THREAT_INTEL (SUCCESS MALICIOUS/HIGH only — never inferred) ---
  if (
    left.threatIntelRisk &&
    right.threatIntelRisk &&
    left.threatIntelRisk === right.threatIntelRisk &&
    (left.threatIntelRisk === "MALICIOUS" || left.threatIntelRisk === "HIGH")
  ) {
    signals.push({
      family: "THREAT_INTEL",
      strength: left.threatIntelRisk === "MALICIOUS" ? "VERY_STRONG" : "STRONG",
      points: left.threatIntelRisk === "MALICIOUS" ? 45 : 30,
      reason: `Shared threat-intel risk (${left.threatIntelRisk})`,
    });
  }

  // --- SCA ---
  const scaA = isScaLikeEvent(left);
  const scaB = isScaLikeEvent(right);
  if (scaA && scaB) {
    const checkA = left.scaCheckId;
    const checkB = right.scaCheckId;
    if (checkA && checkB && checkA === checkB) {
      signals.push({
        family: "SCA",
        strength: "MEDIUM",
        points: 16,
        reason: `Same SCA check (${checkA})`,
      });
    } else if (left.ruleId && right.ruleId && left.ruleId === right.ruleId) {
      signals.push({
        family: "SCA",
        strength: "SUPPORTING",
        points: 5,
        reason: `Same SCA-related rule (${left.ruleId})`,
      });
    } else {
      riskFactors.push(
        "Unrelated SCA/CIS checks — not correlated by check identity"
      );
    }
  }

  // --- MITRE ---
  const techA = new Set(
    asStringArray(left.mitreTechniques).map((t) => t.toUpperCase())
  );
  const techB = new Set(
    asStringArray(right.mitreTechniques).map((t) => t.toUpperCase())
  );
  let sharedTech = 0;
  let sharedTechId: string | undefined;
  for (const t of techA) {
    if (techB.has(t)) {
      sharedTech += 1;
      sharedTechId = t;
    }
  }
  if (sharedTech > 0) {
    signals.push({
      family: "MITRE",
      strength: "MEDIUM",
      points: Math.min(24, sharedTech * 12),
      reason:
        sharedTech === 1
          ? `Shared MITRE technique (${sharedTechId})`
          : `Shared ${sharedTech} MITRE techniques`,
    });
  } else {
    const tacA = new Set(
      asStringArray(left.mitreTactics).map((t) => t.toLowerCase())
    );
    const tacB = new Set(
      asStringArray(right.mitreTactics).map((t) => t.toLowerCase())
    );
    let sharedTac = false;
    for (const t of tacA) {
      if (tacB.has(t)) {
        sharedTac = true;
        break;
      }
    }
    if (sharedTac) {
      signals.push({
        family: "MITRE",
        strength: "SUPPORTING",
        points: 4,
        reason: "Shared MITRE tactic only (supporting)",
      });
    }
  }

  // --- TEMPORAL ---
  const windowMs = windowHours * 60 * 60 * 1000;
  const midA = (left.firstSeenAt.getTime() + left.lastSeenAt.getTime()) / 2;
  const midB = (right.firstSeenAt.getTime() + right.lastSeenAt.getTime()) / 2;
  const delta = Math.abs(midA - midB);
  const withinWindow = delta <= windowMs;
  if (withinWindow) {
    let points = 8;
    let reason = `Within ${windowHours}h temporal window`;
    if (delta <= 30 * 60 * 1000) {
      points = 12;
      reason = "Within 30 minutes of each other";
    }
    signals.push({
      family: "TEMPORAL",
      strength: "SUPPORTING",
      points,
      reason,
    });
  }

  const hasAssetAndTime = sameAsset && withinWindow;
  const hasHashSignal = sharedHash;
  const hasVeryStrongSignal = signals.some((s) => s.strength === "VERY_STRONG");

  const byFamily = new Map<SignalFamily, ScoredSignal>();
  for (const s of signals) {
    const prev = byFamily.get(s.family);
    if (!prev || s.points > prev.points) byFamily.set(s.family, s);
  }
  const uniqueSignals = [...byFamily.values()];

  const families = uniqueSignals.map((s) => s.family);
  const independentFamilies = uniqueSignals
    .filter(
      (s) =>
        s.family !== "TEMPORAL" &&
        s.strength !== "SUPPORTING" &&
        !(s.family === "ASSET_CONTEXT" && s.strength === "WEAK")
    )
    .map((s) => s.family);

  const meaningfulFamilies = uniqueSignals
    .filter(
      (s) =>
        s.family !== "ASSET_CONTEXT" &&
        s.family !== "TEMPORAL" &&
        s.strength !== "SUPPORTING"
    )
    .map((s) => s.family);

  let rawScore = uniqueSignals.reduce((sum, s) => sum + s.points, 0);

  if (
    byFamily.has("IDENTITY") &&
    byFamily.has("PROCESS") &&
    byFamily.get("PROCESS")!.strength !== "SUPPORTING"
  ) {
    rawScore += 8;
    qualityFactors.push("Username + process combination");
  }

  const mult = pairClassificationMultiplier(classA, classB);
  const score = Math.round(rawScore * mult);

  if (classA === "NOISY" && classB === "NOISY" && !hasVeryStrongSignal) {
    return empty({
      score,
      reasons: uniqueSignals.map((s) => s.reason),
      signalCount: uniqueSignals.length,
      hasHashSignal,
      hasAssetAndTime,
      hasVeryStrongSignal,
      signalFamilies: families,
      independentFamilyCount: independentFamilies.length,
      qualityFactors,
      riskFactors: [
        ...riskFactors,
        "NOISY + NOISY pairs do not create candidates without a VERY_STRONG signal",
      ],
      strongSignals: uniqueSignals
        .filter((s) => s.strength === "STRONG" || s.strength === "VERY_STRONG")
        .map((s) => s.reason),
      supportingSignals: uniqueSignals
        .filter((s) => s.strength === "SUPPORTING" || s.strength === "WEAK")
        .map((s) => s.reason),
    });
  }

  if (scaA && scaB && !byFamily.has("SCA") && !hasVeryStrongSignal) {
    return empty({
      score,
      reasons: uniqueSignals.map((s) => s.reason),
      signalCount: uniqueSignals.length,
      hasHashSignal,
      hasAssetAndTime,
      hasVeryStrongSignal,
      signalFamilies: families,
      independentFamilyCount: independentFamilies.length,
      qualityFactors,
      riskFactors: [
        ...riskFactors,
        "Unrelated SCA events without shared check ID",
      ],
      strongSignals: [],
      supportingSignals: uniqueSignals.map((s) => s.reason),
    });
  }

  const eligible =
    hasVeryStrongSignal ||
    meaningfulFamilies.length >= 1 ||
    (independentFamilies.length >= 2 &&
      uniqueSignals.some((s) => s.family !== "ASSET_CONTEXT"));

  if (
    left.correlationKey === right.correlationKey &&
    meaningfulFamilies.length === 0 &&
    !hasVeryStrongSignal
  ) {
    return empty({
      signalCount: uniqueSignals.length,
      hasHashSignal,
      hasAssetAndTime,
      riskFactors: ["Same occurrence correlation key — skipped"],
    });
  }

  if (!eligible) {
    return empty({
      score,
      reasons: uniqueSignals.map((s) => s.reason),
      signalCount: uniqueSignals.length,
      hasHashSignal,
      hasAssetAndTime,
      hasVeryStrongSignal,
      signalFamilies: families,
      independentFamilyCount: independentFamilies.length,
      qualityFactors,
      riskFactors: [
        ...riskFactors,
        "Insufficient signal diversity (asset/agent/time context alone is not enough)",
      ],
      strongSignals: uniqueSignals
        .filter((s) => s.strength === "STRONG" || s.strength === "VERY_STRONG")
        .map((s) => s.reason),
      supportingSignals: uniqueSignals
        .filter((s) => s.strength === "SUPPORTING" || s.strength === "WEAK")
        .map((s) => s.reason),
    });
  }

  if (!withinWindow && !hasVeryStrongSignal) {
    return empty({
      score,
      reasons: uniqueSignals.map((s) => s.reason),
      signalCount: uniqueSignals.length,
      hasHashSignal,
      hasAssetAndTime,
      hasVeryStrongSignal,
      signalFamilies: families,
      independentFamilyCount: independentFamilies.length,
      qualityFactors,
      riskFactors: [...riskFactors, "Outside temporal window"],
      strongSignals: [],
      supportingSignals: [],
    });
  }

  const confidence = confidenceFromScore(score);
  if (mult < 1) {
    qualityFactors.push(
      `Classification weight applied (${classA}/${classB} → ×${mult})`
    );
  }
  if (meaningfulFamilies.length >= 2) {
    qualityFactors.push(`Signal diversity: ${meaningfulFamilies.join(", ")}`);
  }

  return {
    score,
    confidence,
    reasons: uniqueSignals.map((s) => s.reason),
    signalCount: uniqueSignals.length,
    hasHashSignal,
    hasAssetAndTime,
    hasVeryStrongSignal,
    signalFamilies: families,
    independentFamilyCount: independentFamilies.length,
    qualityFactors,
    riskFactors,
    strongSignals: uniqueSignals
      .filter((s) => s.strength === "STRONG" || s.strength === "VERY_STRONG")
      .map((s) => s.reason),
    supportingSignals: uniqueSignals
      .filter((s) => s.strength === "SUPPORTING" || s.strength === "WEAK")
      .map((s) => s.reason),
  };
}

export { CONFIDENCE_THRESHOLDS, ROUTINE_ENDPOINT_RULE_IDS };
