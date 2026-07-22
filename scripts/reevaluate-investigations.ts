/**
 * Re-evaluate correlation under the quality model.
 *
 * Default: DRY RUN (no writes except optional reporting).
 * Apply: npm run investigations:reevaluate -- --apply
 *
 * APPLY never deletes SecurityEvents, analyst/confirmed investigations,
 * or Incident links. It may expire PENDING candidates, refresh candidates,
 * update OPEN SYSTEM_SUGGESTED quality warnings, and create new suggestions
 * only when quality gates pass.
 */
import { PrismaClient } from "@prisma/client";
import { generateCandidatesForEvent } from "../services/investigations/correlation.service";
import { scoreEventPair } from "../services/investigations/correlation-scoring";
import {
  computeQualityMetrics,
  evaluateSuggestionEligibility,
  expirePendingCandidates,
  qualitySummaryToJson,
  qualityWarningForMetrics,
  toScoringFields,
} from "../services/investigations/investigation-quality.service";
import { getFileHashesForEvent } from "../services/investigations/observable.service";
import { suggestGroupsFromPendingCandidates } from "../services/investigations/investigation.service";

const prisma = new PrismaClient();
const ORG =
  process.env.WAZUH_ORGANIZATION_ID || "cly00000000000000000000001";
const apply = process.argv.includes("--apply");

async function analyzeExistingSystemGroup() {
  const group = await prisma.investigationGroup.findFirst({
    where: {
      organizationId: ORG,
      createdByType: "SYSTEM_SUGGESTED",
      status: { in: ["OPEN", "INVESTIGATING"] },
    },
    include: {
      events: {
        where: { removedAt: null },
        include: { securityEvent: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!group) {
    console.log("No OPEN SYSTEM_SUGGESTED group found.");
    return null;
  }

  const events = group.events.map((e) => e.securityEvent);
  const metrics = computeQualityMetrics(events);

  // Pairwise dry-run under new scoring
  const windowHours = 24;
  let qualifyingPairs = 0;
  let pairsChecked = 0;
  const qualifyingEventIds = new Set<string>();
  const families = new Set<string>();
  let hasVeryStrong = false;
  let maxConf: "LOW" | "MEDIUM" | "HIGH" | null = null;

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      pairsChecked += 1;
      const left = {
        ...toScoringFields(a),
        fileHashes: await getFileHashesForEvent(ORG, a.id),
      };
      const right = {
        ...toScoringFields(b),
        fileHashes: await getFileHashesForEvent(ORG, b.id),
      };
      const scored = scoreEventPair(left, right, windowHours);
      if (scored.confidence) {
        qualifyingPairs += 1;
        qualifyingEventIds.add(a.id);
        qualifyingEventIds.add(b.id);
        for (const f of scored.signalFamilies) families.add(f);
        if (scored.hasVeryStrongSignal) hasVeryStrong = true;
        if (
          !maxConf ||
          { LOW: 1, MEDIUM: 2, HIGH: 3 }[scored.confidence] >
            { LOW: 1, MEDIUM: 2, HIGH: 3 }[maxConf]
        ) {
          maxConf = scored.confidence;
        }
      }
    }
  }

  const stillQualify = [...qualifyingEventIds];
  const noLonger = events.filter((e) => !qualifyingEventIds.has(e.id));
  const eligibility = evaluateSuggestionEligibility({
    clusterConfidence: maxConf,
    hasVeryStrongSignal: hasVeryStrong,
    metrics: {
      ...computeQualityMetrics(
        events.filter((e) => qualifyingEventIds.has(e.id))
      ),
      signalFamilyCount: [...families].filter(
        (f) => f !== "TEMPORAL" && f !== "ASSET_CONTEXT"
      ).length,
    },
    signalFamilyCount: [...families].filter(
      (f) => f !== "TEMPORAL" && f !== "ASSET_CONTEXT"
    ).length,
  });

  const warning = qualityWarningForMetrics(metrics, eligibility);

  console.log(
    JSON.stringify(
      {
        groupId: group.id,
        title: group.title,
        totalEvents: events.length,
        metrics,
        pairsChecked,
        qualifyingPairs,
        eventsStillQualify: stillQualify.length,
        eventsNoLongerQualify: noLonger.length,
        noLongerSample: noLonger.slice(0, 10).map((e) => ({
          id: e.id,
          rule: e.ruleId,
          class: e.classification,
          title: e.title?.slice(0, 80),
        })),
        wouldMeetSuggestionThreshold: eligibility.eligible,
        eligibility,
        qualityWarning: warning,
      },
      null,
      2
    )
  );

  if (apply && warning) {
    await prisma.investigationGroup.update({
      where: { id: group.id },
      data: {
        qualityWarning: warning,
        qualitySummary: qualitySummaryToJson(metrics),
      },
    });
    console.log("APPLY: set qualityWarning on existing SYSTEM_SUGGESTED group.");
  }

  return { group, eligibility, warning, metrics };
}

async function main() {
  console.log(
    `\n=== Investigation re-evaluation (${apply ? "APPLY" : "DRY RUN"}) org=${ORG} ===\n`
  );

  await analyzeExistingSystemGroup();

  if (apply) {
    // Invalidate legacy PENDING candidates scored under the old model, then refresh.
    const invalidated = await prisma.correlationCandidate.updateMany({
      where: { organizationId: ORG, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    console.log("Invalidated legacy PENDING candidates:", invalidated.count);

    const expired = await expirePendingCandidates(ORG);
    console.log("Expired candidates:", expired);

    const recent = await prisma.securityEvent.findMany({
      where: {
        organizationId: ORG,
        classification: { not: "IGNORED" },
      },
      orderBy: { lastSeenAt: "desc" },
      take: 50,
      select: { id: true },
    });
    let created = 0;
    for (const e of recent) {
      const r = await generateCandidatesForEvent(ORG, e.id);
      created += r.created;
    }
    console.log("Candidates created in apply pass:", created);

    const suggested = await suggestGroupsFromPendingCandidates(ORG);
    console.log("Suggestion result:", suggested);
    if (suggested.suggested === 0) {
      console.log(
        "No new Investigation suggestion created because correlation quality requirements were not met."
      );
    }

    // Re-flag existing OPEN SYSTEM groups after apply
    await analyzeExistingSystemGroup();
  } else {
    console.log(
      "\nDry run only. Re-run with --apply to expire candidates, refresh, and flag quality warnings."
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
