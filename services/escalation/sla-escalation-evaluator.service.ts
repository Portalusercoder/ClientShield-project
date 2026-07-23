/**
 * SLA escalation ledger + in-app notification fan-out (Phase 4c).
 *
 * EscalationEvent is the idempotent ledger (@@unique organizationId+dedupeKey).
 * Notifications are created only when a new EscalationEvent is persisted.
 */
import {
  Prisma,
  type EscalationMetric,
  type EscalationTriggerType,
  type IncidentSeverity,
  type NotificationSeverity,
  type NotificationType,
  type PrismaClient,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  createNotification,
  listSocRecipientUserIds,
} from "@/services/notifications/notification.service";
import { evaluateIncidentSla } from "@/services/sla/sla-calculator.service";
import type { SlaMetric, SlaMetricResult } from "@/types/sla";

type Db = PrismaClient | Prisma.TransactionClient;

const MTTA_HALF_PCT = 50;
const BATCH_SIZE = 50;

export type PendingSlaTrigger = {
  triggerType: EscalationTriggerType;
  metric: EscalationMetric;
  thresholdPct: number | null;
  dedupeSuffix: "HALF" | "APPROACHING" | "BREACHED";
  notificationType: NotificationType;
  metadata: Record<string, unknown>;
};

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))];
}

function mapSeverity(input: {
  triggerType: EscalationTriggerType;
  incidentSeverity: IncidentSeverity;
}): NotificationSeverity {
  if (input.triggerType === "MTTA_HALF") return "HIGH";
  if (input.triggerType.endsWith("_APPROACHING")) {
    return input.incidentSeverity === "CRITICAL" ? "HIGH" : "WARNING";
  }
  // BREACHED
  return input.incidentSeverity === "CRITICAL" ? "CRITICAL" : "HIGH";
}

function notificationTypeFor(
  trigger: EscalationTriggerType
): NotificationType {
  switch (trigger) {
    case "MTTA_HALF":
      return "SLA_MTTA_HALF";
    case "MTTA_APPROACHING":
      return "SLA_MTTA_APPROACHING";
    case "MTTA_BREACHED":
      return "SLA_MTTA_BREACHED";
    case "MTTC_APPROACHING":
      return "SLA_MTTC_APPROACHING";
    case "MTTC_BREACHED":
      return "SLA_MTTC_BREACHED";
    case "MTTR_APPROACHING":
      return "SLA_MTTR_APPROACHING";
    case "MTTR_BREACHED":
      return "SLA_MTTR_BREACHED";
  }
}

function titleFor(trigger: EscalationTriggerType, caseLabel: string): string {
  switch (trigger) {
    case "MTTA_HALF":
      return `CRITICAL MTTA 50%: ${caseLabel}`;
    case "MTTA_APPROACHING":
      return `MTTA approaching: ${caseLabel}`;
    case "MTTA_BREACHED":
      return `MTTA breached: ${caseLabel}`;
    case "MTTC_APPROACHING":
      return `MTTC approaching: ${caseLabel}`;
    case "MTTC_BREACHED":
      return `MTTC breached: ${caseLabel}`;
    case "MTTR_APPROACHING":
      return `MTTR approaching: ${caseLabel}`;
    case "MTTR_BREACHED":
      return `MTTR breached: ${caseLabel}`;
  }
}

/**
 * Derive which SLA escalation triggers should fire for an evaluation.
 * Pure — does not persist. Finding overdue is never labeled SLA.
 */
export function deriveSlaEscalationTriggers(input: {
  evaluationMetrics: SlaMetricResult[];
  severityAtSnapshot: IncidentSeverity;
  approachingThresholdPct: number;
  acknowledgedAt: Date | null;
  detectedAt: Date;
  now?: Date;
}): PendingSlaTrigger[] {
  const now = input.now ?? new Date();
  const out: PendingSlaTrigger[] = [];
  const byMetric = new Map(
    input.evaluationMetrics.map((m) => [m.metric, m] as const)
  );

  const mtta = byMetric.get("MTTA");
  if (
    input.severityAtSnapshot === "CRITICAL" &&
    input.acknowledgedAt == null &&
    mtta &&
    mtta.targetMinutes != null &&
    mtta.targetMinutes > 0
  ) {
    const elapsed =
      mtta.elapsedMinutes ??
      Math.max(0, (now.getTime() - input.detectedAt.getTime()) / 60_000);
    if (elapsed >= (MTTA_HALF_PCT / 100) * mtta.targetMinutes) {
      out.push({
        triggerType: "MTTA_HALF",
        metric: "MTTA",
        thresholdPct: MTTA_HALF_PCT,
        dedupeSuffix: "HALF",
        notificationType: "SLA_MTTA_HALF",
        metadata: {
          elapsedMinutes: elapsed,
          targetMinutes: mtta.targetMinutes,
          severity: input.severityAtSnapshot,
        },
      });
    }
  }

  for (const metric of ["MTTA", "MTTC", "MTTR"] as SlaMetric[]) {
    const result = byMetric.get(metric);
    if (!result || result.state === "NO_POLICY") continue;

    if (result.state === "APPROACHING") {
      const triggerType = `${metric}_APPROACHING` as EscalationTriggerType;
      out.push({
        triggerType,
        metric: metric as EscalationMetric,
        thresholdPct: input.approachingThresholdPct,
        dedupeSuffix: "APPROACHING",
        notificationType: notificationTypeFor(triggerType),
        metadata: {
          elapsedMinutes: result.elapsedMinutes,
          targetMinutes: result.targetMinutes,
          severity: input.severityAtSnapshot,
          isCompleted: result.isCompleted,
        },
      });
    }

    if (result.state === "BREACHED") {
      const triggerType = `${metric}_BREACHED` as EscalationTriggerType;
      out.push({
        triggerType,
        metric: metric as EscalationMetric,
        thresholdPct: null,
        dedupeSuffix: "BREACHED",
        notificationType: notificationTypeFor(triggerType),
        metadata: {
          elapsedMinutes: result.elapsedMinutes,
          targetMinutes: result.targetMinutes,
          severity: input.severityAtSnapshot,
          isCompleted: result.isCompleted,
          completedLate: result.isCompleted,
        },
      });
    }
  }

  return out;
}

export function slaEscalationDedupeKey(input: {
  incidentId: string;
  generation: number;
  metric: EscalationMetric;
  suffix: "HALF" | "APPROACHING" | "BREACHED";
}): string {
  return `incident:${input.incidentId}:sla:gen${input.generation}:${input.metric}:${input.suffix}`;
}

async function createEscalationEventIdempotent(input: {
  organizationId: string;
  incidentId: string;
  slaSnapshotId: string;
  metric: EscalationMetric;
  triggerType: EscalationTriggerType;
  thresholdPct: number | null;
  dedupeKey: string;
  metadata: Record<string, unknown>;
  db?: Db;
}): Promise<{ id: string; created: boolean }> {
  const db = input.db ?? prisma;
  try {
    const row = await db.escalationEvent.create({
      data: {
        organizationId: input.organizationId,
        incidentId: input.incidentId,
        slaSnapshotId: input.slaSnapshotId,
        metric: input.metric,
        triggerType: input.triggerType,
        thresholdPct: input.thresholdPct,
        dedupeKey: input.dedupeKey,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
    return { id: row.id, created: true };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await db.escalationEvent.findUnique({
        where: {
          organizationId_dedupeKey: {
            organizationId: input.organizationId,
            dedupeKey: input.dedupeKey,
          },
        },
        select: { id: true },
      });
      if (!existing) throw err;
      return { id: existing.id, created: false };
    }
    throw err;
  }
}

async function resolveSlaRecipients(input: {
  organizationId: string;
  assigneeUserId: string | null;
}): Promise<string[]> {
  const soc = await listSocRecipientUserIds(input.organizationId);
  return uniqueIds([...soc, input.assigneeUserId]);
}

/**
 * Evaluate one incident's active SLA snapshot and persist new escalations + notifications.
 */
export async function evaluateIncidentSlaEscalations(input: {
  organizationId: string;
  incidentId: string;
  now?: Date;
}): Promise<{ fired: number; skipped: number }> {
  const now = input.now ?? new Date();

  const incident = await prisma.incident.findFirst({
    where: {
      id: input.incidentId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      title: true,
      caseNumber: true,
      clientId: true,
      assetId: true,
      assignedToUserId: true,
      detectedAt: true,
      acknowledgedAt: true,
      containedAt: true,
      resolvedAt: true,
    },
  });
  if (!incident) return { fired: 0, skipped: 0 };

  const snapshot = await prisma.incidentSlaSnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      incidentId: incident.id,
    },
    orderBy: { generation: "desc" },
  });
  if (!snapshot) return { fired: 0, skipped: 0 };

  const evaluation = evaluateIncidentSla({
    snapshot: {
      id: snapshot.id,
      generation: snapshot.generation,
      policyId: snapshot.policyId,
      clientIdAtSnapshot: snapshot.clientIdAtSnapshot,
      severityAtSnapshot: snapshot.severityAtSnapshot,
      mttaMinutes: snapshot.mttaMinutes,
      mttcMinutes: snapshot.mttcMinutes,
      mttrMinutes: snapshot.mttrMinutes,
      approachingThresholdPct: snapshot.approachingThresholdPct,
      snapshotSource: snapshot.snapshotSource,
      snappedAt: snapshot.snappedAt,
    },
    clocks: {
      detectedAt: incident.detectedAt,
      acknowledgedAt: incident.acknowledgedAt,
      containedAt: incident.containedAt,
      resolvedAt: incident.resolvedAt,
    },
    now,
  });

  if (evaluation.overallState === "NO_POLICY" && evaluation.metrics.length === 0) {
    return { fired: 0, skipped: 0 };
  }

  const triggers = deriveSlaEscalationTriggers({
    evaluationMetrics: evaluation.metrics,
    severityAtSnapshot: snapshot.severityAtSnapshot,
    approachingThresholdPct: snapshot.approachingThresholdPct,
    acknowledgedAt: incident.acknowledgedAt,
    detectedAt: incident.detectedAt,
    now,
  });

  let fired = 0;
  let skipped = 0;
  const recipients = await resolveSlaRecipients({
    organizationId: incident.organizationId,
    assigneeUserId: incident.assignedToUserId,
  });
  const caseLabel = incident.caseNumber ?? incident.title;

  for (const trigger of triggers) {
    const dedupeKey = slaEscalationDedupeKey({
      incidentId: incident.id,
      generation: snapshot.generation,
      metric: trigger.metric,
      suffix: trigger.dedupeSuffix,
    });

    const event = await createEscalationEventIdempotent({
      organizationId: incident.organizationId,
      incidentId: incident.id,
      slaSnapshotId: snapshot.id,
      metric: trigger.metric,
      triggerType: trigger.triggerType,
      thresholdPct: trigger.thresholdPct,
      dedupeKey,
      metadata: trigger.metadata,
    });

    if (!event.created) {
      skipped += 1;
      continue;
    }

    if (recipients.length > 0) {
      await createNotification({
        organizationId: incident.organizationId,
        type: trigger.notificationType,
        severity: mapSeverity({
          triggerType: trigger.triggerType,
          incidentSeverity: snapshot.severityAtSnapshot,
        }),
        title: titleFor(trigger.triggerType, caseLabel),
        message: `SLA ${trigger.triggerType.replaceAll("_", " ").toLowerCase()} for incident ${caseLabel}.`,
        sourceType: "INCIDENT",
        sourceId: incident.id,
        clientId: incident.clientId,
        assetId: incident.assetId,
        dedupeKey,
        href: `/incidents/${incident.id}`,
        recipientUserIds: recipients,
      });
    }
    fired += 1;
  }

  return { fired, skipped };
}

/**
 * Batch evaluate active SLA snapshots across organizations.
 * Restart-safe / multi-instance-safe via EscalationEvent unique dedupe.
 */
export async function runSlaEscalationEvaluationPass(input?: {
  organizationId?: string;
  now?: Date;
  batchSize?: number;
}): Promise<{
  evaluated: number;
  fired: number;
  skipped: number;
  organizations: number;
}> {
  const now = input?.now ?? new Date();
  const batchSize = input?.batchSize ?? BATCH_SIZE;

  const orgFilter = input?.organizationId
    ? { organizationId: input.organizationId }
    : {};

  // Active snapshot = max generation per incident (via distinct incidents + latest).
  const snapshots = await prisma.incidentSlaSnapshot.findMany({
    where: orgFilter,
    orderBy: [{ organizationId: "asc" }, { incidentId: "asc" }, { generation: "desc" }],
    select: {
      id: true,
      organizationId: true,
      incidentId: true,
      generation: true,
    },
  });

  const seen = new Set<string>();
  const active: typeof snapshots = [];
  for (const snap of snapshots) {
    if (seen.has(snap.incidentId)) continue;
    seen.add(snap.incidentId);
    active.push(snap);
  }

  let evaluated = 0;
  let fired = 0;
  let skipped = 0;
  const orgs = new Set<string>();

  for (let i = 0; i < active.length; i += batchSize) {
    const batch = active.slice(i, i + batchSize);
    for (const snap of batch) {
      orgs.add(snap.organizationId);
      const result = await evaluateIncidentSlaEscalations({
        organizationId: snap.organizationId,
        incidentId: snap.incidentId,
        now,
      });
      evaluated += 1;
      fired += result.fired;
      skipped += result.skipped;
    }
  }

  return {
    evaluated,
    fired,
    skipped,
    organizations: orgs.size,
  };
}
