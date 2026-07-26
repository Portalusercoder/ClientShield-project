import type { FindingSeverity, IncidentSeverity, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";

export const ASSIGNABLE_ROLES: UserRole[] = ["ANALYST", "ADMIN", "OWNER"];

export const SEVERITY_ORDER: IncidentSeverity[] = [
  "INFO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

export function mapFindingSeverityToIncident(
  severity: FindingSeverity
): IncidentSeverity {
  // Conservative mapping — never escalate INFO findings to high incident severity
  switch (severity) {
    case "CRITICAL":
      return "HIGH";
    case "HIGH":
      return "MEDIUM";
    case "MEDIUM":
      return "MEDIUM";
    case "LOW":
      return "LOW";
    case "INFO":
      return "INFO";
    default:
      return "MEDIUM";
  }
}

export function diffMs(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  return Math.max(0, to.getTime() - from.getTime());
}

export async function assertClientInOrg(
  organizationId: string,
  clientId: string
): Promise<void> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true },
  });
  if (!client) throw new Error("Client not found");
}

export async function assertAssetInOrg(
  organizationId: string,
  assetId: string,
  clientId?: string
): Promise<{ clientId: string }> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId },
    select: { id: true, clientId: true },
  });
  if (!asset) throw new Error("Asset not found");
  if (clientId && asset.clientId !== clientId) {
    throw new Error("Asset does not belong to the selected client");
  }
  return { clientId: asset.clientId };
}

export async function assertAssigneeInOrg(
  organizationId: string,
  userId: string
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      organizationId,
      role: { in: ASSIGNABLE_ROLES },
    },
    select: { id: true },
  });
  if (!user) {
    throw new Error(
      "Assignee must be an ANALYST, ADMIN, or OWNER in this organization"
    );
  }
}

export async function getIncidentOrThrow(
  organizationId: string,
  incidentId: string
) {
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, organizationId },
  });
  if (!incident) throw new Error("Incident not found");
  return incident;
}
