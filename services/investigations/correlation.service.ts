import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import {
  meetsMinConfidence,
  orderEventIds,
  scoreEventPair,
  type ScoringEventSnapshot,
} from "@/services/investigations/correlation-scoring";
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
  event: {
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
  }
): Promise<ScoringEventSnapshot> {
  const fileHashes = await getFileHashesForEvent(organizationId, event.id);
  return {
    id: event.id,
    assetId: event.assetId,
    agentId: event.agentId,
    sourceIp: event.sourceIp,
    destinationIp: event.destinationIp,
    username: event.username,
    processName: event.processName,
    correlationKey: event.correlationKey,
    firstSeenAt: event.firstSeenAt,
    lastSeenAt: event.lastSeenAt,
    mitreTactics: event.mitreTactics,
    mitreTechniques: event.mitreTechniques,
    fileHashes,
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
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const event = await prisma.securityEvent.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!event) return { created, updated, skipped };

    const peers = await prisma.securityEvent.findMany({
      where: {
        organizationId,
        id: { not: eventId },
        lastSeenAt: { gte: since },
      },
      orderBy: { lastSeenAt: "desc" },
      take: 200,
    });

    const left = await toSnapshot(organizationId, event);

    for (const peer of peers) {
      // Skip same correlationKey when it is only the occurrence of the same SE grouping
      if (peer.correlationKey === event.correlationKey) {
        skipped += 1;
        continue;
      }

      const right = await toSnapshot(organizationId, peer);
      const scored = scoreEventPair(left, right, windowHours);
      if (!scored.confidence || !meetsMinConfidence(scored.confidence)) {
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

      if (existing) {
        if (existing.status === "PENDING") {
          await prisma.correlationCandidate.update({
            where: { id: existing.id },
            data: {
              score: scored.score,
              confidence: scored.confidence,
              reasons: scored.reasons as Prisma.InputJsonValue,
            },
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
          score: scored.score,
          confidence: scored.confidence,
          reasons: scored.reasons as Prisma.InputJsonValue,
          status: "PENDING",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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
    where: { organizationId, lastSeenAt: { gte: since } },
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
      investigationGroupId: input.investigationGroupId ?? candidate.investigationGroupId,
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
