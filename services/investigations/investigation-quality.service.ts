/**
 * Investigation quality metrics, fingerprints, overlap, and suggestion gates.
 */
import type {
  CorrelationConfidence,
  Prisma,
  SecurityEventClassification,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import {
  confidenceRank,
  isRoutineEndpointRule,
  isScaLikeEvent,
  type ScoringEventSnapshot,
} from "@/services/investigations/correlation-scoring";
import { SCA_NOISY_RULE_IDS } from "@/services/wazuh/wazuh-classification.service";
import type { InvestigationQualityMetrics } from "@/types/investigations";

const STRONG_OBSERVABLE_TYPES = new Set([
  "FILE_HASH",
  "IP_ADDRESS",
  "DOMAIN",
  "URL",
]);

function effectiveClass(event: {
  classification: SecurityEventClassification;
  ruleId: string | null;
}): SecurityEventClassification {
  if (event.ruleId && SCA_NOISY_RULE_IDS.has(event.ruleId)) return "NOISY";
  if (
    isRoutineEndpointRule(event.ruleId) &&
    event.classification === "ACTIONABLE"
  ) {
    return "INFORMATIONAL";
  }
  return event.classification;
}

export function computeQualityMetrics(
  events: Array<{
    classification: SecurityEventClassification;
    ruleId: string | null;
    assetId: string | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
  }>,
  options?: {
    observableCount?: number;
    strongObservableCount?: number;
    signalFamilyCount?: number;
  }
): InvestigationQualityMetrics {
  let actionable = 0;
  let informational = 0;
  let noisy = 0;
  let ignored = 0;
  const rules = new Set<string>();
  const actionableRules = new Set<string>();
  const assets = new Set<string>();
  let first: Date | null = null;
  let last: Date | null = null;

  for (const e of events) {
    const c = effectiveClass(e);
    if (c === "ACTIONABLE") actionable += 1;
    else if (c === "INFORMATIONAL") informational += 1;
    else if (c === "NOISY") noisy += 1;
    else if (c === "IGNORED") ignored += 1;

    if (e.ruleId) {
      rules.add(e.ruleId);
      if (c === "ACTIONABLE") actionableRules.add(e.ruleId);
    }
    if (e.assetId) assets.add(e.assetId);
    if (!first || e.firstSeenAt < first) first = e.firstSeenAt;
    if (!last || e.lastSeenAt > last) last = e.lastSeenAt;
  }

  return {
    eventCount: events.length,
    actionableEventCount: actionable,
    informationalEventCount: informational,
    noisyEventCount: noisy,
    ignoredEventCount: ignored,
    distinctRuleCount: rules.size,
    distinctActionableRuleCount: actionableRules.size,
    distinctAssetCount: assets.size,
    observableCount: options?.observableCount ?? 0,
    strongObservableCount: options?.strongObservableCount ?? 0,
    signalFamilyCount: options?.signalFamilyCount ?? 0,
    firstSeenAt: first,
    lastSeenAt: last,
  };
}

export async function loadQualityMetricsForGroup(
  organizationId: string,
  groupId: string
): Promise<InvestigationQualityMetrics> {
  const links = await prisma.investigationGroupEvent.findMany({
    where: { organizationId, groupId, removedAt: null },
    include: {
      securityEvent: {
        select: {
          classification: true,
          ruleId: true,
          assetId: true,
          firstSeenAt: true,
          lastSeenAt: true,
        },
      },
    },
  });
  const eventIds = links.map((l) => l.securityEventId);
  const obsLinks =
    eventIds.length === 0
      ? []
      : await prisma.securityEventObservable.findMany({
          where: { organizationId, securityEventId: { in: eventIds } },
          include: { observable: { select: { type: true, id: true } } },
        });
  const obsIds = new Set(obsLinks.map((o) => o.observableId));
  const strongObs = new Set(
    obsLinks
      .filter((o) => STRONG_OBSERVABLE_TYPES.has(o.observable.type))
      .map((o) => o.observableId)
  );

  return computeQualityMetrics(
    links.map((l) => l.securityEvent),
    {
      observableCount: obsIds.size,
      strongObservableCount: strongObs.size,
    }
  );
}

/**
 * Fingerprint for SYSTEM_SUGGESTED dedupe.
 * Same asset + overlapping strong rules/observables + hour bucket → same campaign.
 * Different attacks on same asset with different rule cores remain separate.
 */
export function buildInvestigationFingerprint(input: {
  organizationId: string;
  assetId: string | null;
  ruleIds: string[];
  strongObservableKeys: string[];
  firstSeenAt: Date | null;
}): string {
  const hourBucket = input.firstSeenAt
    ? Math.floor(input.firstSeenAt.getTime() / (60 * 60 * 1000))
    : 0;
  const rules = [...new Set(input.ruleIds.filter(Boolean))].sort().slice(0, 8);
  const obs = [...new Set(input.strongObservableKeys.filter(Boolean))]
    .sort()
    .slice(0, 8);
  return [
    input.organizationId,
    input.assetId ?? "no-asset",
    rules.join(",") || "no-rules",
    obs.join(",") || "no-obs",
    String(hourBucket),
  ].join("|");
}

export type OverlapResult = {
  score: number;
  sharedEventRatio: number;
  sharedEventCount: number;
  sameAsset: boolean;
  temporalOverlap: boolean;
  reasons: string[];
};

export function scoreInvestigationOverlap(input: {
  eventIdsA: string[];
  eventIdsB: string[];
  assetIdA: string | null;
  assetIdB: string | null;
  firstA: Date | null;
  lastA: Date | null;
  firstB: Date | null;
  lastB: Date | null;
}): OverlapResult {
  const setA = new Set(input.eventIdsA);
  const setB = new Set(input.eventIdsB);
  let shared = 0;
  for (const id of setA) if (setB.has(id)) shared += 1;
  const denom = Math.max(setA.size, setB.size, 1);
  const sharedEventRatio = shared / denom;
  const sameAsset = Boolean(
    input.assetIdA && input.assetIdB && input.assetIdA === input.assetIdB
  );

  let temporalOverlap = false;
  if (input.firstA && input.lastA && input.firstB && input.lastB) {
    temporalOverlap = !(
      input.lastA < input.firstB || input.lastB < input.firstA
    );
  }

  const reasons: string[] = [];
  if (shared > 0) {
    reasons.push(
      `${Math.round(sharedEventRatio * 100)}% shared SecurityEvents (${shared})`
    );
  }
  if (sameAsset) reasons.push("Same endpoint/asset");
  if (temporalOverlap) reasons.push("Overlapping time window");

  let score = Math.round(sharedEventRatio * 70);
  if (sameAsset) score += 15;
  if (temporalOverlap) score += 10;
  score = Math.min(100, score);

  return {
    score,
    sharedEventRatio,
    sharedEventCount: shared,
    sameAsset,
    temporalOverlap,
    reasons,
  };
}

export type SuggestionEligibility = {
  eligible: boolean;
  reasons: string[];
  blockers: string[];
};

/**
 * SYSTEM_SUGGESTED threshold — stricter than candidate creation.
 */
export function evaluateSuggestionEligibility(input: {
  clusterConfidence: CorrelationConfidence | null;
  hasVeryStrongSignal: boolean;
  metrics: InvestigationQualityMetrics;
  signalFamilyCount: number;
}): SuggestionEligibility {
  const reasons: string[] = [];
  const blockers: string[] = [];
  const minConf = serverEnv.INVESTIGATION_SUGGESTION_MIN_CONFIDENCE;
  const minActionable = serverEnv.INVESTIGATION_MIN_ACTIONABLE_EVENTS;
  const minFamilies = serverEnv.INVESTIGATION_MIN_SIGNAL_FAMILIES;

  if (input.metrics.eventCount < 2) {
    blockers.push("Fewer than 2 distinct SecurityEvents");
  }

  if (input.hasVeryStrongSignal) {
    reasons.push("VERY_STRONG shared signal (e.g. file hash)");
    return {
      eligible: blockers.length === 0,
      reasons,
      blockers,
    };
  }

  const confOk =
    confidenceRank(input.clusterConfidence) >= confidenceRank(minConf);
  if (confOk) {
    reasons.push(`Cluster confidence meets ${minConf}`);
  }

  // MEDIUM may pass with diversity gates when suggestion min is HIGH:
  // allow MEDIUM only if all diversity gates pass AND suggestion min is not HIGH-only...
  // Spec: HIGH OR (MEDIUM with diversity). So if min is HIGH, still allow MEDIUM+diversity.
  const mediumWithDiversity =
    confidenceRank(input.clusterConfidence) >= confidenceRank("MEDIUM") &&
    input.metrics.actionableEventCount >= minActionable &&
    input.signalFamilyCount >= minFamilies &&
    (input.metrics.distinctRuleCount >= 2 ||
      input.metrics.distinctActionableRuleCount >= 2);

  if (mediumWithDiversity) {
    reasons.push(
      `MEDIUM+ with diversity (≥${minActionable} actionable, ≥${minFamilies} families, rule diversity)`
    );
  }

  if (!confOk && !mediumWithDiversity) {
    blockers.push(
      `Suggestion threshold not met (need ${minConf}, or MEDIUM with diversity gates)`
    );
  }

  if (input.metrics.actionableEventCount < minActionable && !input.hasVeryStrongSignal) {
    blockers.push(
      `Fewer than ${minActionable} actionable events (effective classification)`
    );
  }

  if (
    input.metrics.noisyEventCount > 0 &&
    input.metrics.actionableEventCount === 0 &&
    !input.hasVeryStrongSignal
  ) {
    blockers.push("NOISY-dominated cluster without actionable detections");
  }

  // Pure SCA / routine noise campaigns
  if (
    input.metrics.actionableEventCount === 0 &&
    input.metrics.informationalEventCount + input.metrics.noisyEventCount >= 2
  ) {
    blockers.push("Informational/noisy-only activity is not campaign-worthy");
  }

  return {
    eligible: blockers.length === 0 && (confOk || mediumWithDiversity),
    reasons,
    blockers,
  };
}

export function qualityWarningForMetrics(
  metrics: InvestigationQualityMetrics,
  eligibility: SuggestionEligibility
): string | null {
  if (eligibility.eligible) return null;
  if (metrics.noisyEventCount + metrics.informationalEventCount >= metrics.eventCount * 0.7) {
    return "Quality warning: most linked events are routine/noisy under the current correlation policy. Review before confirming.";
  }
  if (eligibility.blockers.length > 0) {
    return `Quality warning: ${eligibility.blockers[0]}`;
  }
  return "Quality warning: this group may not meet current SYSTEM_SUGGESTED thresholds.";
}

export async function expirePendingCandidates(
  organizationId?: string
): Promise<{ expired: number }> {
  const hours = serverEnv.INVESTIGATION_CANDIDATE_EXPIRY_HOURS;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const result = await prisma.correlationCandidate.updateMany({
    where: {
      status: "PENDING",
      ...(organizationId ? { organizationId } : {}),
      OR: [
        { expiresAt: { lte: new Date() } },
        { expiresAt: null, createdAt: { lte: cutoff } },
      ],
    },
    data: { status: "EXPIRED" },
  });
  return { expired: result.count };
}

export function toScoringFields(event: {
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
  classification: SecurityEventClassification;
  ruleId: string | null;
  ruleGroups: unknown;
  scaCheckId: string | null;
  title: string | null;
  severity: string | null;
}): Omit<ScoringEventSnapshot, "fileHashes" | "threatIntelRisk"> {
  return {
    id: event.id,
    assetId: event.assetId,
    agentId: event.agentId,
    sourceIp: event.sourceIp,
    destinationIp: event.destinationIp,
    username: event.username,
    processName: event.processName,
    filePath: event.filePath,
    correlationKey: event.correlationKey,
    firstSeenAt: event.firstSeenAt,
    lastSeenAt: event.lastSeenAt,
    mitreTactics: event.mitreTactics,
    mitreTechniques: event.mitreTechniques,
    classification: event.classification,
    ruleId: event.ruleId,
    ruleGroups: event.ruleGroups,
    scaCheckId: event.scaCheckId,
    title: event.title,
    severity: event.severity,
  };
}

export function qualitySummaryToJson(
  metrics: InvestigationQualityMetrics
): Prisma.InputJsonValue {
  return {
    ...metrics,
    firstSeenAt: metrics.firstSeenAt?.toISOString() ?? null,
    lastSeenAt: metrics.lastSeenAt?.toISOString() ?? null,
  };
}

export { isScaLikeEvent, effectiveClass };
