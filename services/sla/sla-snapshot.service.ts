/**
 * Incident SLA snapshot lifecycle.
 *
 * Snapshot creation:
 * - New Incident with HIGH/CRITICAL + resolvable enabled policy → generation 1
 * - Reopen (RESOLVED/CLOSED → INVESTIGATING) + resolvable policy → new generation
 * - No policy → no snapshot (NO_POLICY); never invent targets
 * - No historical backfill of existing incidents
 *
 * Policy edits never mutate existing snapshots.
 * Severity changes while open do not replace the active snapshot (MVP limitation).
 */
import type { Incident, IncidentSeverity, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveEffectiveSlaPolicy } from "@/services/sla/sla-policy.service";
import {
  evaluateIncidentSla,
  type SnapshotInput,
} from "@/services/sla/sla-calculator.service";
import { isSlaMvpSeverity, type IncidentSlaEvaluation } from "@/types/sla";

type Tx = Prisma.TransactionClient;

function toSnapshotInput(row: {
  id: string;
  generation: number;
  policyId: string | null;
  clientIdAtSnapshot: string | null;
  severityAtSnapshot: IncidentSeverity;
  mttaMinutes: number | null;
  mttcMinutes: number | null;
  mttrMinutes: number | null;
  approachingThresholdPct: number;
  snapshotSource: "ORG_DEFAULT" | "CLIENT_OVERRIDE";
  snappedAt: Date;
}): SnapshotInput {
  return {
    id: row.id,
    generation: row.generation,
    policyId: row.policyId,
    clientIdAtSnapshot: row.clientIdAtSnapshot,
    severityAtSnapshot: row.severityAtSnapshot,
    mttaMinutes: row.mttaMinutes,
    mttcMinutes: row.mttcMinutes,
    mttrMinutes: row.mttrMinutes,
    approachingThresholdPct: row.approachingThresholdPct,
    snapshotSource: row.snapshotSource,
    snappedAt: row.snappedAt,
  };
}

export async function getActiveIncidentSlaSnapshot(input: {
  organizationId: string;
  incidentId: string;
}): Promise<SnapshotInput | null> {
  const row = await prisma.incidentSlaSnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      incidentId: input.incidentId,
    },
    orderBy: { generation: "desc" },
  });
  return row ? toSnapshotInput(row) : null;
}

export async function listIncidentSlaSnapshots(input: {
  organizationId: string;
  incidentId: string;
}): Promise<SnapshotInput[]> {
  const rows = await prisma.incidentSlaSnapshot.findMany({
    where: {
      organizationId: input.organizationId,
      incidentId: input.incidentId,
    },
    orderBy: { generation: "asc" },
  });
  return rows.map(toSnapshotInput);
}

/**
 * Create next snapshot generation if an effective policy exists.
 * Returns null when NO_POLICY (no row written).
 */
export async function createIncidentSlaSnapshot(input: {
  organizationId: string;
  actorId: string;
  incident: Pick<
    Incident,
    "id" | "clientId" | "severity" | "organizationId"
  >;
  reason: "CREATED" | "REOPENED";
  tx?: Tx;
}): Promise<SnapshotInput | null> {
  const db = input.tx ?? prisma;
  if (!isSlaMvpSeverity(input.incident.severity)) {
    return null;
  }

  const resolved = await resolveEffectiveSlaPolicy({
    organizationId: input.organizationId,
    clientId: input.incident.clientId,
    severity: input.incident.severity,
  });
  if (!resolved) return null;

  const latest = await db.incidentSlaSnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      incidentId: input.incident.id,
    },
    orderBy: { generation: "desc" },
    select: { generation: true },
  });
  const generation = (latest?.generation ?? 0) + 1;

  const row = await db.incidentSlaSnapshot.create({
    data: {
      organizationId: input.organizationId,
      incidentId: input.incident.id,
      generation,
      policyId: resolved.policyId,
      clientIdAtSnapshot: input.incident.clientId,
      severityAtSnapshot: input.incident.severity,
      mttaMinutes: resolved.mttaMinutes,
      mttcMinutes: resolved.mttcMinutes,
      mttrMinutes: resolved.mttrMinutes,
      approachingThresholdPct: resolved.approachingThresholdPct,
      snapshotSource: resolved.snapshotSource,
    },
  });

  // Audit outside transaction when possible; when inside tx, still write audit
  // via same client so it commits together.
  await db.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action:
        input.reason === "REOPENED"
          ? "INCIDENT_SLA_SNAPSHOT_REOPENED"
          : "INCIDENT_SLA_SNAPSHOT_CREATED",
      resourceType: "IncidentSlaSnapshot",
      resourceId: row.id,
      metadata: {
        incidentId: input.incident.id,
        generation,
        policyId: resolved.policyId,
        snapshotSource: resolved.snapshotSource,
        severity: input.incident.severity,
        mttaMinutes: resolved.mttaMinutes,
        mttcMinutes: resolved.mttcMinutes,
        mttrMinutes: resolved.mttrMinutes,
        approachingThresholdPct: resolved.approachingThresholdPct,
      },
    },
  });

  return toSnapshotInput(row);
}

export async function evaluateIncidentSlaForIncident(input: {
  organizationId: string;
  incident: Pick<
    Incident,
    | "id"
    | "detectedAt"
    | "acknowledgedAt"
    | "containedAt"
    | "resolvedAt"
  >;
  now?: Date;
}): Promise<IncidentSlaEvaluation> {
  const snapshot = await getActiveIncidentSlaSnapshot({
    organizationId: input.organizationId,
    incidentId: input.incident.id,
  });
  return evaluateIncidentSla({
    snapshot,
    clocks: {
      detectedAt: input.incident.detectedAt,
      acknowledgedAt: input.incident.acknowledgedAt,
      containedAt: input.incident.containedAt,
      resolvedAt: input.incident.resolvedAt,
    },
    now: input.now,
  });
}

/** Batch-load active snapshots for attention enrichment. */
export async function loadActiveSnapshotsForIncidents(input: {
  organizationId: string;
  incidentIds: string[];
}): Promise<Map<string, SnapshotInput>> {
  const map = new Map<string, SnapshotInput>();
  if (input.incidentIds.length === 0) return map;

  const rows = await prisma.incidentSlaSnapshot.findMany({
    where: {
      organizationId: input.organizationId,
      incidentId: { in: input.incidentIds },
    },
    orderBy: [{ incidentId: "asc" }, { generation: "desc" }],
  });

  for (const row of rows) {
    if (!map.has(row.incidentId)) {
      map.set(row.incidentId, toSnapshotInput(row));
    }
  }
  return map;
}

/** Convenience for non-tx audit when create path is outside transaction. */
export async function createIncidentSlaSnapshotOutsideTx(input: {
  organizationId: string;
  actorId: string;
  incident: Pick<
    Incident,
    "id" | "clientId" | "severity" | "organizationId"
  >;
  reason: "CREATED" | "REOPENED";
}): Promise<SnapshotInput | null> {
  return createIncidentSlaSnapshot(input);
}
