import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/services/audit.service";
import { appendIncidentActivity } from "@/services/incidents/activity";

const LEAD_ROLES: UserRole[] = ["ANALYST", "ADMIN", "OWNER"];
const COMMANDER_ROLES: UserRole[] = ["ADMIN", "OWNER"];

async function getIncidentOrThrow(organizationId: string, incidentId: string) {
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, organizationId },
  });
  if (!incident) throw new Error("Incident not found");
  return incident;
}

async function getActorRole(
  organizationId: string,
  actorId: string
): Promise<UserRole> {
  const actor = await prisma.user.findFirst({
    where: { id: actorId, organizationId },
    select: { role: true },
  });
  if (!actor) throw new Error("Actor not found in organization");
  return actor.role;
}

/**
 * Sets lead analyst. Actor must be ANALYST+. Target must be ANALYST+ in org.
 */
export async function setLeadAnalyst(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  leadAnalystUserId: string | null;
}): Promise<void> {
  const actorRole = await getActorRole(input.organizationId, input.actorId);
  if (!LEAD_ROLES.includes(actorRole)) {
    throw new Error("Only ANALYST, ADMIN, or OWNER can set lead analyst");
  }

  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );

  if (input.leadAnalystUserId) {
    const user = await prisma.user.findFirst({
      where: {
        id: input.leadAnalystUserId,
        organizationId: input.organizationId,
        role: { in: LEAD_ROLES },
      },
      select: { id: true },
    });
    if (!user) {
      throw new Error(
        "Lead Analyst must be an ANALYST, ADMIN, or OWNER in this organization"
      );
    }
  }

  await prisma.incident.update({
    where: { id: incident.id },
    data: {
      leadAnalystUserId: input.leadAnalystUserId,
      ...(input.leadAnalystUserId
        ? { assignedToUserId: input.leadAnalystUserId }
        : {}),
    },
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: incident.id,
    actorUserId: input.actorId,
    activityType: "LEAD_ANALYST_ASSIGNED",
    message: input.leadAnalystUserId
      ? "Lead Analyst assigned"
      : "Lead Analyst cleared",
    metadata: {
      from: incident.leadAnalystUserId,
      to: input.leadAnalystUserId,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_LEAD_ANALYST_ASSIGNED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: {
      from: incident.leadAnalystUserId,
      to: input.leadAnalystUserId,
    },
  });
}

/**
 * Sets incident commander. Actor must be ADMIN+. Target must be ADMIN/OWNER.
 */
export async function setCommander(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  commanderUserId: string | null;
}): Promise<void> {
  const actorRole = await getActorRole(input.organizationId, input.actorId);
  if (!COMMANDER_ROLES.includes(actorRole)) {
    throw new Error("Only ADMIN or OWNER can set incident commander");
  }

  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );

  if (input.commanderUserId) {
    const user = await prisma.user.findFirst({
      where: {
        id: input.commanderUserId,
        organizationId: input.organizationId,
        role: { in: COMMANDER_ROLES },
      },
      select: { id: true },
    });
    if (!user) {
      throw new Error(
        "Incident Commander must be an ADMIN or OWNER in this organization"
      );
    }
  }

  await prisma.incident.update({
    where: { id: incident.id },
    data: { commanderUserId: input.commanderUserId },
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: incident.id,
    actorUserId: input.actorId,
    activityType: "COMMANDER_ASSIGNED",
    message: input.commanderUserId
      ? "Incident Commander assigned"
      : "Incident Commander cleared",
    metadata: {
      from: incident.commanderUserId,
      to: input.commanderUserId,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_COMMANDER_ASSIGNED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: {
      from: incident.commanderUserId,
      to: input.commanderUserId,
    },
  });
}

/** Alias for setCommander */
export const setIncidentCommander = setCommander;

export async function listCommanderCandidates(organizationId: string) {
  return prisma.user.findMany({
    where: { organizationId, role: { in: COMMANDER_ROLES } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { email: "asc" },
  });
}

export async function listLeadCandidates(organizationId: string) {
  return prisma.user.findMany({
    where: { organizationId, role: { in: LEAD_ROLES } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { email: "asc" },
  });
}
