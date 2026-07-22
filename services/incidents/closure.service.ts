import type { IncidentSeverity } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sanitizeIncidentText } from "@/lib/incidents/sanitize";

export interface ClosureCheckResult {
  ok: boolean;
  errors: string[];
}

/**
 * Closure requirements:
 * - Always: resolutionSummary + closing note
 * - HIGH/CRITICAL: rootCause OR impactSummary/businessImpact; containmentSummary
 * - Required playbook/manual tasks: COMPLETED or SKIPPED (with skipReason)
 * - No required tasks left BLOCKED
 * - INFO/LOW: lighter docs (resolution + closing note + required tasks only)
 */
export async function assertCanCloseIncident(input: {
  organizationId: string;
  incidentId: string;
  closingNote: string;
}): Promise<ClosureCheckResult> {
  const errors: string[] = [];
  const note = sanitizeIncidentText(input.closingNote, 5000);
  if (!note) {
    errors.push("A closing note is required");
  }

  const incident = await prisma.incident.findFirst({
    where: { id: input.incidentId, organizationId: input.organizationId },
  });
  if (!incident) {
    return { ok: false, errors: ["Incident not found"] };
  }

  if (!sanitizeIncidentText(incident.resolutionSummary, 5000)) {
    errors.push("Resolution summary is required before closing");
  }

  const highSeverity: IncidentSeverity[] = ["HIGH", "CRITICAL"];
  if (highSeverity.includes(incident.severity)) {
    const hasImpact =
      !!sanitizeIncidentText(incident.impactSummary, 5000) ||
      !!sanitizeIncidentText(incident.businessImpact, 5000) ||
      !!sanitizeIncidentText(incident.rootCause, 5000);
    if (!hasImpact) {
      errors.push(
        "HIGH/CRITICAL cases require root cause or impact summary before closing"
      );
    }
    if (!sanitizeIncidentText(incident.containmentSummary, 5000)) {
      errors.push(
        "HIGH/CRITICAL cases require a containment summary before closing"
      );
    }
  }

  const tasks = await prisma.incidentResponseTask.findMany({
    where: {
      organizationId: input.organizationId,
      incidentId: input.incidentId,
      isRequired: true,
    },
    select: { id: true, title: true, status: true, skipReason: true },
  });

  for (const task of tasks) {
    if (task.status === "BLOCKED") {
      errors.push(
        `Required task still blocked: ${task.title}. Resolve or skip with reason before closing.`
      );
    } else if (task.status === "SKIPPED" && !task.skipReason) {
      errors.push(`Required skipped task missing reason: ${task.title}`);
    } else if (task.status !== "COMPLETED" && task.status !== "SKIPPED") {
      errors.push(
        `Required task incomplete: ${task.title} (${task.status})`
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

export function requireClosureOk(result: ClosureCheckResult): void {
  if (!result.ok) {
    throw new Error(result.errors.join("; "));
  }
}
