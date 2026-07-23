/**
 * SlaPolicy CRUD + resolution (org default + client override).
 * MVP: HIGH/CRITICAL only. No production seed policies.
 */
import type { IncidentSeverity, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hasMinimumRole } from "@/lib/auth/permissions";
import type { AuthSession } from "@/lib/auth/types";
import { createAuditLog } from "@/services/audit.service";
import {
  isSlaMvpSeverity,
  SLA_DEFAULT_APPROACHING_PCT,
  SLA_MAX_MINUTES,
  type ResolvedSlaPolicy,
  type SlaMvpSeverity,
  type SlaPolicyInput,
  type SlaPolicyRecord,
} from "@/types/sla";

function assertAdmin(session: AuthSession): void {
  if (!hasMinimumRole(session, "ADMIN")) {
    throw new Error("Forbidden");
  }
}

function mapPolicy(
  row: {
    id: string;
    organizationId: string;
    clientId: string | null;
    severity: IncidentSeverity;
    mttaMinutes: number | null;
    mttcMinutes: number | null;
    mttrMinutes: number | null;
    approachingThresholdPct: number;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    client?: { name: string } | null;
  }
): SlaPolicyRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientId: row.clientId,
    clientName: row.client?.name ?? null,
    severity: row.severity,
    mttaMinutes: row.mttaMinutes,
    mttcMinutes: row.mttcMinutes,
    mttrMinutes: row.mttrMinutes,
    approachingThresholdPct: row.approachingThresholdPct,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeMinutes(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error("SLA target minutes must be an integer");
  }
  if (value <= 0) {
    throw new Error("SLA target minutes must be greater than 0");
  }
  if (value > SLA_MAX_MINUTES) {
    throw new Error("SLA target minutes cannot exceed 525600 (365 days)");
  }
  return value;
}

export function validateSlaPolicyInput(input: SlaPolicyInput): {
  severity: SlaMvpSeverity;
  mttaMinutes: number | null;
  mttcMinutes: number | null;
  mttrMinutes: number | null;
  approachingThresholdPct: number;
  enabled: boolean;
  clientId: string | null;
} {
  if (!isSlaMvpSeverity(input.severity)) {
    throw new Error("SLA policies support HIGH and CRITICAL only");
  }

  const mttaMinutes = normalizeMinutes(input.mttaMinutes);
  const mttcMinutes = normalizeMinutes(input.mttcMinutes);
  const mttrMinutes = normalizeMinutes(input.mttrMinutes);
  const enabled = input.enabled ?? true;
  const approachingThresholdPct =
    input.approachingThresholdPct ?? SLA_DEFAULT_APPROACHING_PCT;

  if (
    !Number.isInteger(approachingThresholdPct) ||
    approachingThresholdPct < 1 ||
    approachingThresholdPct > 99
  ) {
    throw new Error("Approaching threshold must be an integer from 1 to 99");
  }

  if (
    enabled &&
    mttaMinutes == null &&
    mttcMinutes == null &&
    mttrMinutes == null
  ) {
    throw new Error(
      "Enabled SLA policy requires at least one of MTTA, MTTC, or MTTR"
    );
  }

  return {
    severity: input.severity,
    mttaMinutes,
    mttcMinutes,
    mttrMinutes,
    approachingThresholdPct,
    enabled,
    clientId: input.clientId ?? null,
  };
}

async function assertClientInOrg(
  organizationId: string,
  clientId: string
): Promise<void> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true },
  });
  if (!client) throw new Error("Client not found");
}

/**
 * Resolve effective policy for an incident severity + client.
 * Enabled client override → enabled org default → null (NO_POLICY).
 * Disabled override falls through to org default.
 */
export async function resolveEffectiveSlaPolicy(input: {
  organizationId: string;
  clientId: string | null;
  severity: IncidentSeverity;
}): Promise<ResolvedSlaPolicy | null> {
  if (!isSlaMvpSeverity(input.severity)) {
    return null;
  }

  if (input.clientId) {
    const override = await prisma.slaPolicy.findFirst({
      where: {
        organizationId: input.organizationId,
        clientId: input.clientId,
        severity: input.severity,
        enabled: true,
      },
    });
    if (override) {
      return {
        policyId: override.id,
        organizationId: override.organizationId,
        clientId: override.clientId,
        severity: override.severity,
        mttaMinutes: override.mttaMinutes,
        mttcMinutes: override.mttcMinutes,
        mttrMinutes: override.mttrMinutes,
        approachingThresholdPct: override.approachingThresholdPct,
        snapshotSource: "CLIENT_OVERRIDE",
      };
    }
  }

  const orgDefault = await prisma.slaPolicy.findFirst({
    where: {
      organizationId: input.organizationId,
      clientId: null,
      severity: input.severity,
      enabled: true,
    },
  });
  if (!orgDefault) return null;

  return {
    policyId: orgDefault.id,
    organizationId: orgDefault.organizationId,
    clientId: null,
    severity: orgDefault.severity,
    mttaMinutes: orgDefault.mttaMinutes,
    mttcMinutes: orgDefault.mttcMinutes,
    mttrMinutes: orgDefault.mttrMinutes,
    approachingThresholdPct: orgDefault.approachingThresholdPct,
    snapshotSource: "ORG_DEFAULT",
  };
}

export async function listSlaPolicies(
  organizationId: string,
  options?: { clientId?: string | null }
): Promise<SlaPolicyRecord[]> {
  const where: Prisma.SlaPolicyWhereInput = { organizationId };
  if (options?.clientId === null) {
    where.clientId = null;
  } else if (typeof options?.clientId === "string") {
    where.clientId = options.clientId;
  }

  const rows = await prisma.slaPolicy.findMany({
    where,
    include: { client: { select: { name: true } } },
    orderBy: [{ clientId: "asc" }, { severity: "asc" }],
  });
  return rows.map(mapPolicy);
}

export async function upsertSlaPolicy(input: {
  session: AuthSession;
  data: SlaPolicyInput;
}): Promise<SlaPolicyRecord> {
  assertAdmin(input.session);
  const organizationId = input.session.organizationId;
  const validated = validateSlaPolicyInput(input.data);

  if (validated.clientId) {
    await assertClientInOrg(organizationId, validated.clientId);
  }

  const existing = await prisma.slaPolicy.findFirst({
    where: {
      organizationId,
      clientId: validated.clientId,
      severity: validated.severity,
    },
  });

  const data = {
    mttaMinutes: validated.mttaMinutes,
    mttcMinutes: validated.mttcMinutes,
    mttrMinutes: validated.mttrMinutes,
    approachingThresholdPct: validated.approachingThresholdPct,
    enabled: validated.enabled,
  };

  let row;
  let action: string;
  if (existing) {
    const wasEnabled = existing.enabled;
    row = await prisma.slaPolicy.update({
      where: { id: existing.id },
      data,
      include: { client: { select: { name: true } } },
    });
    if (wasEnabled !== row.enabled) {
      action = row.enabled ? "SLA_POLICY_ENABLED" : "SLA_POLICY_DISABLED";
    } else {
      action = "SLA_POLICY_UPDATED";
    }
  } else {
    row = await prisma.slaPolicy.create({
      data: {
        organizationId,
        clientId: validated.clientId,
        severity: validated.severity,
        ...data,
      },
      include: { client: { select: { name: true } } },
    });
    action = "SLA_POLICY_CREATED";
  }

  await createAuditLog({
    organizationId,
    actorId: input.session.userId,
    action,
    resourceType: "SlaPolicy",
    resourceId: row.id,
    metadata: {
      clientId: row.clientId,
      severity: row.severity,
      enabled: row.enabled,
      mttaMinutes: row.mttaMinutes,
      mttcMinutes: row.mttcMinutes,
      mttrMinutes: row.mttrMinutes,
      approachingThresholdPct: row.approachingThresholdPct,
    },
  });

  return mapPolicy(row);
}

export async function setSlaPolicyEnabled(input: {
  session: AuthSession;
  policyId: string;
  enabled: boolean;
}): Promise<SlaPolicyRecord> {
  assertAdmin(input.session);
  const organizationId = input.session.organizationId;

  const existing = await prisma.slaPolicy.findFirst({
    where: { id: input.policyId, organizationId },
  });
  if (!existing) throw new Error("SLA policy not found");

  const row = await prisma.slaPolicy.update({
    where: { id: existing.id },
    data: { enabled: input.enabled },
    include: { client: { select: { name: true } } },
  });

  await createAuditLog({
    organizationId,
    actorId: input.session.userId,
    action: input.enabled ? "SLA_POLICY_ENABLED" : "SLA_POLICY_DISABLED",
    resourceType: "SlaPolicy",
    resourceId: row.id,
    metadata: {
      clientId: row.clientId,
      severity: row.severity,
      enabled: row.enabled,
    },
  });

  return mapPolicy(row);
}

/** Effective source label for settings UI for a client+severity. */
export async function describeSlaSourceForClient(input: {
  organizationId: string;
  clientId: string;
  severity: SlaMvpSeverity;
}): Promise<"CLIENT_OVERRIDE" | "ORGANIZATION_DEFAULT" | "NO_POLICY"> {
  const resolved = await resolveEffectiveSlaPolicy({
    organizationId: input.organizationId,
    clientId: input.clientId,
    severity: input.severity,
  });
  if (!resolved) return "NO_POLICY";
  return resolved.snapshotSource === "CLIENT_OVERRIDE"
    ? "CLIENT_OVERRIDE"
    : "ORGANIZATION_DEFAULT";
}
