import type { IncidentStatus } from "@prisma/client";
import type { IncidentSlaMetrics } from "@/types/incidents";
import { diffMs } from "@/services/incidents/shared";

export function calculateIncidentSla(timestamps: {
  detectedAt: Date;
  acknowledgedAt: Date | null;
  containedAt: Date | null;
  resolvedAt: Date | null;
}): IncidentSlaMetrics {
  return {
    timeToAcknowledgeMs: diffMs(
      timestamps.detectedAt,
      timestamps.acknowledgedAt
    ),
    timeToContainMs: diffMs(timestamps.detectedAt, timestamps.containedAt),
    timeToResolveMs: diffMs(timestamps.detectedAt, timestamps.resolvedAt),
  };
}

export function timestampFieldsForStatus(
  to: IncidentStatus,
  now: Date
): Partial<{
  acknowledgedAt: Date;
  investigationStartedAt: Date;
  containedAt: Date;
  eradicatedAt: Date;
  recoveringAt: Date;
  resolvedAt: Date;
  closedAt: Date;
}> {
  switch (to) {
    case "ACKNOWLEDGED":
      return { acknowledgedAt: now };
    case "INVESTIGATING":
      return { investigationStartedAt: now };
    case "CONTAINED":
      return { containedAt: now };
    case "ERADICATED":
      return { eradicatedAt: now };
    case "RECOVERING":
      return { recoveringAt: now };
    case "RESOLVED":
      return { resolvedAt: now };
    case "CLOSED":
      return { closedAt: now };
    default:
      return {};
  }
}
