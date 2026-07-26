import type { IncidentSeverity } from "@prisma/client";
import {
  areSameClientCohort,
  assertUniformClientIds,
  normalizeClientId,
} from "@/lib/client-isolation";
import { prisma } from "@/lib/db";
import { acceptCandidate } from "@/services/investigations/correlation.service";
import { appendInvestigationActivity } from "@/services/investigations/investigation-activity.service";
import {
  aggregateMitre,
  buildGroupingExplanation,
  mapEventSeverityToIncident,
  refreshGroupMitre,
  severityRank,
} from "@/services/investigations/investigation-queries.service";
import {
  buildInvestigationFingerprint,
  computeQualityMetrics,
  evaluateSuggestionEligibility,
  loadQualityMetricsForGroup,
  qualitySummaryToJson,
  qualityWarningForMetrics,
  scoreInvestigationOverlap,
} from "@/services/investigations/investigation-quality.service";
import { addEvent } from "@/services/investigations/investigation.service";

/**
 * System-suggested group from a high-quality cluster.
 * Status remains OPEN — never auto-CONFIRMED.
 * Never auto-merges CONFIRMED or LINKED_TO_INCIDENT groups.
 */
export async function createSystemSuggestedGroup(input: {
  organizationId: string;
  eventIds: string[];
  reasons: string[];
  titleHint?: string | null;
  confidence?: "LOW" | "MEDIUM" | "HIGH" | null;
  signalFamilies?: string[];
  hasVeryStrongSignal?: boolean;
  strongSignals?: string[];
  supportingSignals?: string[];
}) {
  const eventIds = [...new Set(input.eventIds)];
  if (eventIds.length < 2) {
    throw new Error("System suggested group requires at least 2 events");
  }

  const events = await prisma.securityEvent.findMany({
    where: { organizationId: input.organizationId, id: { in: eventIds } },
    include: { asset: { select: { name: true } } },
  });
  if (events.length < 2) {
    throw new Error("Insufficient events for suggested group");
  }

  const proposedClientId = assertUniformClientIds(
    events.map((e) => e.clientId),
    "system suggested investigation"
  );

  const metrics = computeQualityMetrics(events);
  const eligibility = evaluateSuggestionEligibility({
    clusterConfidence: input.confidence ?? null,
    hasVeryStrongSignal: Boolean(input.hasVeryStrongSignal),
    metrics,
    signalFamilyCount: input.signalFamilies?.length ?? 0,
  });
  if (!eligibility.eligible) {
    throw new Error(
      `Suggestion threshold not met: ${eligibility.blockers.join("; ") || "quality gates failed"}`
    );
  }

  const fingerprint = buildInvestigationFingerprint({
    organizationId: input.organizationId,
    assetId: events.find((e) => e.assetId)?.assetId ?? null,
    ruleIds: events.map((e) => e.ruleId).filter(Boolean) as string[],
    strongObservableKeys: [],
    firstSeenAt: metrics.firstSeenAt,
  });

  // Only OPEN / INVESTIGATING SYSTEM_SUGGESTED may be updated — never CONFIRMED / LINKED
  const existingOpen = await prisma.investigationGroup.findMany({
    where: {
      organizationId: input.organizationId,
      createdByType: "SYSTEM_SUGGESTED",
      status: { in: ["OPEN", "INVESTIGATING"] },
      // Prefer same client scope before fingerprint/overlap matching
      ...(proposedClientId
        ? { clientId: proposedClientId }
        : { clientId: null }),
    },
    include: {
      events: {
        where: { removedAt: null },
        select: {
          securityEventId: true,
          securityEvent: {
            select: {
              firstSeenAt: true,
              lastSeenAt: true,
              clientId: true,
            },
          },
        },
      },
    },
    take: 50,
  });

  const targetSet = new Set(eventIds);
  const primaryAssetId = events.find((e) => e.assetId)?.assetId ?? null;

  for (const g of existingOpen) {
    const existingClientIds = g.events.map((e) => e.securityEvent.clientId);
    // Defense in depth: full resulting set must remain one client cohort
    try {
      assertUniformClientIds(
        [...existingClientIds, ...events.map((e) => e.clientId)],
        "system suggested investigation merge"
      );
    } catch {
      continue;
    }

    // Never touch confirmed / incident-linked (already filtered by status)
    if (g.fingerprint && g.fingerprint === fingerprint) {
      // expand below
    } else {
      const ids = g.events.map((e) => e.securityEventId);
      const overlap = scoreInvestigationOverlap({
        eventIdsA: ids,
        eventIdsB: eventIds,
        assetIdA: g.assetId,
        assetIdB: primaryAssetId,
        firstA: g.events[0]?.securityEvent.firstSeenAt ?? null,
        lastA:
          g.events.map((e) => e.securityEvent.lastSeenAt).sort((a, b) => +b - +a)[0] ??
          null,
        firstB: metrics.firstSeenAt,
        lastB: metrics.lastSeenAt,
      });
      const sameExact =
        ids.length === targetSet.size && ids.every((id) => targetSet.has(id));
      if (!sameExact && overlap.sharedEventRatio < 0.5 && g.fingerprint !== fingerprint) {
        continue;
      }
    }

    const ids = g.events.map((e) => e.securityEventId);
    for (const eid of eventIds) {
      if (ids.includes(eid)) continue;
      await prisma.investigationGroupEvent.upsert({
        where: {
          groupId_securityEventId: {
            groupId: g.id,
            securityEventId: eid,
          },
        },
        create: {
          organizationId: input.organizationId,
          groupId: g.id,
          securityEventId: eid,
          addReason: "Expanded from overlapping SYSTEM suggestion",
        },
        update: {
          removedAt: null,
          removeReason: null,
          addedAt: new Date(),
          addReason: "Expanded from overlapping SYSTEM suggestion",
        },
      });
    }
    await refreshGroupMitre(input.organizationId, g.id);
    const refreshedMetrics = await loadQualityMetricsForGroup(
      input.organizationId,
      g.id
    );
    const refreshedEligibility = evaluateSuggestionEligibility({
      clusterConfidence: input.confidence ?? g.confidence,
      hasVeryStrongSignal: Boolean(input.hasVeryStrongSignal),
      metrics: refreshedMetrics,
      signalFamilyCount: input.signalFamilies?.length ?? 0,
    });
    await prisma.investigationGroup.update({
      where: { id: g.id },
      data: {
        fingerprint,
        confidence: input.confidence ?? g.confidence,
        qualitySummary: qualitySummaryToJson(refreshedMetrics),
        qualityWarning: qualityWarningForMetrics(
          refreshedMetrics,
          refreshedEligibility
        ),
        groupingExplanation: buildGroupingExplanation([
          ...(input.reasons ?? []),
          ...(input.strongSignals ?? []),
        ]),
      },
    });
    return g;
  }

  const mitre = aggregateMitre(events);
  let severity: IncidentSeverity = "MEDIUM";
  for (const e of events) {
    const mapped = mapEventSeverityToIncident(e.severity);
    if (severityRank(mapped) > severityRank(severity)) severity = mapped;
  }

  const assetName =
    input.titleHint ||
    events.find((e) => e.asset?.name)?.asset?.name ||
    events.find((e) => e.agentName)?.agentName ||
    "multiple hosts";

  const explanationParts = [
    ...(input.strongSignals?.length
      ? [`Strong signals: ${input.strongSignals.join("; ")}`]
      : []),
    ...(input.supportingSignals?.length
      ? [`Supporting: ${input.supportingSignals.join("; ")}`]
      : []),
    ...input.reasons,
  ];

  const group = await prisma.investigationGroup.create({
    data: {
      organizationId: input.organizationId,
      clientId: proposedClientId,
      assetId: events.find((e) => e.assetId)?.assetId ?? null,
      title: `Potential related activity: ${assetName}`.slice(0, 300),
      status: "OPEN",
      severity,
      createdByType: "SYSTEM_SUGGESTED",
      confidence: input.confidence ?? null,
      fingerprint,
      qualitySummary: qualitySummaryToJson(metrics),
      qualityWarning: null,
      groupingExplanation: buildGroupingExplanation(explanationParts),
      mitreTactics: mitre.tactics,
      mitreTechniques: mitre.techniques,
      events: {
        create: events.map((e) => ({
          organizationId: input.organizationId,
          securityEventId: e.id,
          addReason: "SYSTEM_SUGGESTED correlation",
        })),
      },
    },
  });

  await appendInvestigationActivity({
    organizationId: input.organizationId,
    groupId: group.id,
    activityType: "CREATED",
    message: `System suggested investigation group (${events.length} events)`,
    metadata: {
      securityEventIds: eventIds,
      reasons: input.reasons,
      eligibility: eligibility.reasons,
    },
  });

  return group;
}

/**
 * Suggest OPEN SYSTEM_SUGGESTED groups from PENDING candidates that meet
 * the investigation suggestion quality threshold.
 * Does NOT auto-confirm. Does NOT create incidents.
 */
export async function suggestGroupsFromPendingCandidates(
  organizationId: string
): Promise<{ suggested: number; skipped: number }> {
  const pendingRaw = await prisma.correlationCandidate.findMany({
    where: {
      organizationId,
      status: "PENDING",
      confidence: { in: ["HIGH", "MEDIUM"] },
    },
    orderBy: { score: "desc" },
    take: 100,
  });

  const eventIdSet = new Set<string>();
  for (const c of pendingRaw) {
    eventIdSet.add(c.eventAId);
    eventIdSet.add(c.eventBId);
  }
  const eventClientRows =
    eventIdSet.size === 0
      ? []
      : await prisma.securityEvent.findMany({
          where: { organizationId, id: { in: [...eventIdSet] } },
          select: { id: true, clientId: true },
        });
  const clientByEventId = new Map(
    eventClientRows.map((e) => [e.id, normalizeClientId(e.clientId)])
  );

  // Partition by client cohort before union-find so cross-client edges never merge
  const pending = pendingRaw.filter((c) =>
    areSameClientCohort(
      clientByEventId.get(c.eventAId),
      clientByEventId.get(c.eventBId)
    )
  );

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p !== x) {
      const root = find(p);
      parent.set(x, root);
      return root;
    }
    return x;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const reasonsByRoot = new Map<string, string[]>();
  const familiesByRoot = new Map<string, Set<string>>();
  const strongByRoot = new Map<string, string[]>();
  const supportingByRoot = new Map<string, string[]>();
  const maxConfByRoot = new Map<string, "LOW" | "MEDIUM" | "HIGH">();
  const hasVeryStrongByRoot = new Map<string, boolean>();

  for (const c of pending) {
    union(c.eventAId, c.eventBId);
  }
  for (const c of pending) {
    find(c.eventAId);
    find(c.eventBId);
  }

  const clusters = new Map<string, Set<string>>();
  for (const c of pending) {
    for (const id of [c.eventAId, c.eventBId]) {
      const root = find(id);
      if (!clusters.has(root)) clusters.set(root, new Set());
      clusters.get(root)!.add(id);
    }
    const root = find(c.eventAId);
    const reasons = Array.isArray(c.reasons)
      ? (c.reasons as unknown[]).filter((r): r is string => typeof r === "string")
      : [];
    reasonsByRoot.set(root, [...(reasonsByRoot.get(root) ?? []), ...reasons]);

    const families = Array.isArray(c.signalFamilies)
      ? (c.signalFamilies as unknown[]).filter(
          (r): r is string => typeof r === "string"
        )
      : [];
    if (!familiesByRoot.has(root)) familiesByRoot.set(root, new Set());
    for (const f of families) familiesByRoot.get(root)!.add(f);

    const qf = Array.isArray(c.qualityFactors)
      ? (c.qualityFactors as unknown[]).filter(
          (r): r is string => typeof r === "string"
        )
      : [];
    if (qf.some((x) => /VERY_STRONG|file hash|Shared file hash/i.test(x))) {
      hasVeryStrongByRoot.set(root, true);
    }
    if (reasons.some((r) => /Shared file hash/i.test(r))) {
      hasVeryStrongByRoot.set(root, true);
      strongByRoot.set(root, [
        ...(strongByRoot.get(root) ?? []),
        ...reasons.filter((r) => /hash|public source IP/i.test(r)),
      ]);
    }
    supportingByRoot.set(root, [
      ...(supportingByRoot.get(root) ?? []),
      ...reasons.filter((r) => /temporal|asset|agent|tactic|private/i.test(r)),
    ]);

    const prev = maxConfByRoot.get(root);
    if (
      !prev ||
      { LOW: 1, MEDIUM: 2, HIGH: 3 }[c.confidence] >
        { LOW: 1, MEDIUM: 2, HIGH: 3 }[prev]
    ) {
      maxConfByRoot.set(root, c.confidence);
    }
  }

  let suggested = 0;
  let skipped = 0;
  // Count filtered cross-cohort pending edges as skipped
  skipped += pendingRaw.length - pending.length;

  for (const [root, eventSet] of clusters) {
    if (eventSet.size < 2) {
      skipped += 1;
      continue;
    }
    const eventIds = [...eventSet];
    // Defense in depth: refuse mixed-cohort clusters even if an edge slipped through
    const cohortIds = eventIds.map((id) => clientByEventId.get(id) ?? null);
    try {
      assertUniformClientIds(cohortIds, "suggest groups from pending");
    } catch {
      skipped += 1;
      continue;
    }

    const events = await prisma.securityEvent.findMany({
      where: { organizationId, id: { in: eventIds } },
    });
    const metrics = computeQualityMetrics(events);
    const families = [...(familiesByRoot.get(root) ?? [])];
    const eligibility = evaluateSuggestionEligibility({
      clusterConfidence: maxConfByRoot.get(root) ?? null,
      hasVeryStrongSignal: Boolean(hasVeryStrongByRoot.get(root)),
      metrics: {
        ...metrics,
        signalFamilyCount: families.filter(
          (f) => f !== "TEMPORAL" && f !== "ASSET_CONTEXT"
        ).length,
      },
      signalFamilyCount: families.filter(
        (f) => f !== "TEMPORAL" && f !== "ASSET_CONTEXT"
      ).length,
    });

    if (!eligibility.eligible) {
      skipped += 1;
      continue;
    }

    const reasons = reasonsByRoot.get(root) ?? [];
    try {
      const group = await createSystemSuggestedGroup({
        organizationId,
        eventIds,
        reasons,
        confidence: maxConfByRoot.get(root) ?? null,
        signalFamilies: families,
        hasVeryStrongSignal: Boolean(hasVeryStrongByRoot.get(root)),
        strongSignals: [...new Set(strongByRoot.get(root) ?? [])],
        supportingSignals: [...new Set(supportingByRoot.get(root) ?? [])],
      });
      await prisma.correlationCandidate.updateMany({
        where: {
          organizationId,
          status: "PENDING",
          OR: [{ eventAId: { in: eventIds }, eventBId: { in: eventIds } }],
        },
        data: { investigationGroupId: group.id },
      });
      suggested += 1;
    } catch (error) {
      skipped += 1;
      const { logger } = await import("@/lib/observability/logger");
      logger.warn("suggestGroupsFromPendingCandidates cluster skipped", {
        service: "investigation.service",
        err: error instanceof Error ? error : new Error("unknown"),
      });
    }
  }

  return { suggested, skipped };
}

/**
 * Accept a candidate and ensure both events are in an investigation group.
 */
export async function acceptCandidateIntoInvestigation(input: {
  organizationId: string;
  actorId: string;
  candidateId: string;
}) {
  const candidate = await prisma.correlationCandidate.findFirst({
    where: { id: input.candidateId, organizationId: input.organizationId },
  });
  if (!candidate) throw new Error("Correlation candidate not found");

  let groupId = candidate.investigationGroupId;
  if (!groupId) {
    const reasons = Array.isArray(candidate.reasons)
      ? (candidate.reasons as unknown[]).filter(
          (r): r is string => typeof r === "string"
        )
      : [];
    const group = await createSystemSuggestedGroup({
      organizationId: input.organizationId,
      eventIds: [candidate.eventAId, candidate.eventBId],
      reasons,
    });
    groupId = group.id;
  } else {
    await addEvent({
      organizationId: input.organizationId,
      actorId: input.actorId,
      groupId,
      securityEventId: candidate.eventAId,
    });
    await addEvent({
      organizationId: input.organizationId,
      actorId: input.actorId,
      groupId,
      securityEventId: candidate.eventBId,
    });
  }

  await acceptCandidate({
    organizationId: input.organizationId,
    actorId: input.actorId,
    candidateId: candidate.id,
    investigationGroupId: groupId,
  });

  return { investigationGroupId: groupId };
}
