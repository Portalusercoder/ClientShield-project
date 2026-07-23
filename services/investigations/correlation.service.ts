import type { Prisma } from "@prisma/client";
import {
  areSameClientCohort,
  normalizeClientId,
} from "@/lib/client-isolation";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import {
  meetsCandidateMinConfidence,
  orderEventIds,
  scoreEventPair,
  type ScoringEventSnapshot,
} from "@/services/investigations/correlation-scoring";
import { toScoringFields } from "@/services/investigations/investigation-quality.service";
import { getFileHashesForEvent } from "@/services/investigations/observable.service";
import { appendInvestigationActivity } from "@/services/investigations/investigation-activity.service";

function logCorr(level: "warn" | "error" | "info", message: string, meta?: object) {
  // eslint-disable-next-line no-console
  console[level === "info" ? "log" : level](
    JSON.stringify({
      ts: new Date().toISOString(),
      service: "correlation.service",
      level,
      message,
      ...meta,
    })
  );
}

async function toSnapshot(
  organizationId: string,
  event: Parameters<typeof toScoringFields>[0]
): Promise<ScoringEventSnapshot> {
  const fileHashes = await getFileHashesForEvent(organizationId, event.id);
  return {
    ...toScoringFields(event),
    fileHashes,
    threatIntelRisk: null,
  };
}

/**
 * Generate PENDING correlation candidates for one event against recent
 * same-org events in the configured window. Never crosses organizations.
 */
export async function generateCandidatesForEvent(
  organizationId: string,
  eventId: string
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    const windowHours = serverEnv.INVESTIGATION_CORRELATION_WINDOW_HOURS;
    const expiryHours = serverEnv.INVESTIGATION_CANDIDATE_EXPIRY_HOURS;
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const event = await prisma.securityEvent.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!event) return { created, updated, skipped };

    // IGNORED never seeds candidates
    if (event.classification === "IGNORED") {
      return { created, updated, skipped: 1 };
    }

    // Client cohort isolation: attributed peers share exact clientId;
    // unattributed seed only sees null-client peers. Never filter by assetId.
    const seedClientId = normalizeClientId(event.clientId);
    const peers = await prisma.securityEvent.findMany({
      where: {
        organizationId,
        id: { not: eventId },
        lastSeenAt: { gte: since },
        classification: { not: "IGNORED" },
        ...(seedClientId
          ? { clientId: seedClientId }
          : { clientId: null }),
      },
      orderBy: { lastSeenAt: "desc" },
      take: 200,
    });

    const left = await toSnapshot(organizationId, event);

    for (const peer of peers) {
      // Defense in depth — never persist mismatched client cohorts
      if (!areSameClientCohort(event.clientId, peer.clientId)) {
        skipped += 1;
        continue;
      }

      if (peer.correlationKey === event.correlationKey) {
        skipped += 1;
        continue;
      }

      const right = await toSnapshot(organizationId, peer);
      const scored = scoreEventPair(left, right, windowHours);
      if (!scored.confidence || !meetsCandidateMinConfidence(scored.confidence)) {
        skipped += 1;
        continue;
      }

      const [eventAId, eventBId] = orderEventIds(event.id, peer.id);
      const existing = await prisma.correlationCandidate.findUnique({
        where: {
          organizationId_eventAId_eventBId: {
            organizationId,
            eventAId,
            eventBId,
          },
        },
      });

      const payload = {
        score: scored.score,
        confidence: scored.confidence,
        reasons: scored.reasons as Prisma.InputJsonValue,
        signalFamilies: scored.signalFamilies as Prisma.InputJsonValue,
        qualityFactors: [
          ...scored.qualityFactors,
          ...scored.riskFactors,
        ] as Prisma.InputJsonValue,
      };

      if (existing) {
        if (existing.status === "PENDING") {
          await prisma.correlationCandidate.update({
            where: { id: existing.id },
            data: payload,
          });
          updated += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      await prisma.correlationCandidate.create({
        data: {
          organizationId,
          eventAId,
          eventBId,
          ...payload,
          status: "PENDING",
          expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000),
        },
      });
      created += 1;
    }
    return { created, updated, skipped };
  } catch (error) {
    logCorr("error", "generateCandidatesForEvent failed", {
      organizationId,
      eventId,
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { created, updated, skipped };
  }
}

/**
 * Light pass over recent events for an organization.
 */
export async function runCorrelationPass(
  organizationId: string
): Promise<{ eventsScanned: number; candidatesCreated: number }> {
  const windowHours = serverEnv.INVESTIGATION_CORRELATION_WINDOW_HOURS;
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const events = await prisma.securityEvent.findMany({
    where: {
      organizationId,
      lastSeenAt: { gte: since },
      classification: { not: "IGNORED" },
    },
    orderBy: { lastSeenAt: "desc" },
    take: 50,
    select: { id: true },
  });

  let candidatesCreated = 0;
  for (const e of events) {
    const r = await generateCandidatesForEvent(organizationId, e.id);
    candidatesCreated += r.created;
  }
  return { eventsScanned: events.length, candidatesCreated };
}

export async function listPendingCandidates(
  organizationId: string,
  options?: { page?: number; pageSize?: number }
) {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 50;
  const where = { organizationId, status: "PENDING" as const };

  // Fetch a wider window so we can filter invalid legacy pairs without mutating them
  const fetchTake = Math.min(pageSize * 5, 500);
  const rows = await prisma.correlationCandidate.findMany({
    where,
    orderBy: [{ confidence: "desc" }, { score: "desc" }],
    take: fetchTake,
    include: {
      eventA: {
        select: {
          id: true,
          title: true,
          severity: true,
          ruleId: true,
          clientId: true,
        },
      },
      eventB: {
        select: {
          id: true,
          title: true,
          severity: true,
          ruleId: true,
          clientId: true,
        },
      },
    },
  });

  const valid: typeof rows = [];
  const invalidLegacy: Array<{ id: string; eventAId: string; eventBId: string }> =
    [];
  for (const row of rows) {
    if (areSameClientCohort(row.eventA.clientId, row.eventB.clientId)) {
      valid.push(row);
    } else {
      invalidLegacy.push({
        id: row.id,
        eventAId: row.eventAId,
        eventBId: row.eventBId,
      });
    }
  }

  if (invalidLegacy.length > 0) {
    logCorr("warn", "listPendingCandidates hid invalid client-cohort pairs", {
      organizationId,
      count: invalidLegacy.length,
      sampleIds: invalidLegacy.slice(0, 10).map((r) => r.id),
    });
  }

  const total = valid.length;
  const items = valid.slice((page - 1) * pageSize, page * pageSize);
  return {
    total,
    items,
    page,
    pageSize,
    invalidLegacyCandidateCount: invalidLegacy.length,
    invalidLegacyCandidateIds: invalidLegacy.map((r) => r.id),
  };
}

export async function acceptCandidate(input: {
  organizationId: string;
  actorId: string;
  candidateId: string;
  investigationGroupId?: string;
}): Promise<{ id: string; investigationGroupId: string | null }> {
  const candidate = await prisma.correlationCandidate.findFirst({
    where: { id: input.candidateId, organizationId: input.organizationId },
  });
  if (!candidate) throw new Error("Correlation candidate not found");
  if (candidate.status !== "PENDING") {
    throw new Error(`Candidate is ${candidate.status}, cannot accept`);
  }

  const updated = await prisma.correlationCandidate.update({
    where: { id: candidate.id },
    data: {
      status: "ACCEPTED",
      reviewedAt: new Date(),
      reviewedByUserId: input.actorId,
      investigationGroupId:
        input.investigationGroupId ?? candidate.investigationGroupId,
    },
  });

  if (updated.investigationGroupId) {
    await appendInvestigationActivity({
      organizationId: input.organizationId,
      groupId: updated.investigationGroupId,
      actorUserId: input.actorId,
      activityType: "CANDIDATE_ACCEPTED",
      message: `Correlation candidate accepted (${candidate.eventAId} ↔ ${candidate.eventBId})`,
      metadata: { candidateId: candidate.id, score: candidate.score },
    });
  }

  return {
    id: updated.id,
    investigationGroupId: updated.investigationGroupId,
  };
}

export async function rejectCandidate(input: {
  organizationId: string;
  actorId: string;
  candidateId: string;
  reason?: string;
}): Promise<void> {
  const candidate = await prisma.correlationCandidate.findFirst({
    where: { id: input.candidateId, organizationId: input.organizationId },
  });
  if (!candidate) throw new Error("Correlation candidate not found");
  if (candidate.status !== "PENDING") {
    throw new Error(`Candidate is ${candidate.status}, cannot reject`);
  }

  await prisma.correlationCandidate.update({
    where: { id: candidate.id },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedByUserId: input.actorId,
      rejectReason: input.reason?.slice(0, 2000) ?? null,
    },
  });

  if (candidate.investigationGroupId) {
    await appendInvestigationActivity({
      organizationId: input.organizationId,
      groupId: candidate.investigationGroupId,
      actorUserId: input.actorId,
      activityType: "CANDIDATE_REJECTED",
      message: `Correlation candidate rejected`,
      note: input.reason,
      metadata: { candidateId: candidate.id },
    });
  }
}
