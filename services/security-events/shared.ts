import type {
  IncidentSeverity,
  SecurityEventSeverity,
  SecurityEventStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";

export const ACTIVE_STATUSES: SecurityEventStatus[] = [
  "NEW",
  "REVIEWING",
  "ACKNOWLEDGED",
];

export function mapEventSeverityToIncident(
  severity: SecurityEventSeverity
): IncidentSeverity {
  switch (severity) {
    case "CRITICAL":
      return "CRITICAL";
    case "HIGH":
      return "HIGH";
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

export async function getEventOrThrow(organizationId: string, id: string) {
  const event = await prisma.securityEvent.findFirst({
    where: { id, organizationId },
  });
  if (!event) throw new Error("Security event not found");
  return event;
}
