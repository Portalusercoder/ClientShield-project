import type {
  IncidentActivityType,
  IncidentSeverity,
  IncidentStatus,
  Prisma,
} from "@prisma/client";
import { assertMatchesTargetClient } from "@/lib/client-isolation";
import { prisma } from "@/lib/db";
import { sanitizeIncidentText } from "@/lib/incidents/sanitize";
import type {
  AssignIncidentInput,
  CreateIncidentInput,
  EscalateFindingInput,
  UpdateIncidentResponseInput,
} from "@/lib/validations/incidents";
import { createAuditLog } from "@/services/audit.service";
import {
  countIncidentAssignmentGeneration,
  notifyCriticalIncidentCreated,
  notifyIncidentAssigned,
  notifyIncidentResolved,
} from "@/services/notifications/notification-producers.service";
import { createIncidentSlaSnapshot } from "@/services/sla/sla-snapshot.service";
import { appendIncidentActivity } from "@/services/incidents/activity";
import { allocateNextCaseNumber } from "@/services/incidents/case-number.service";
import {
  assertCanCloseIncident,
  requireClosureOk,
} from "@/services/incidents/closure.service";
import { assertIncidentTransition } from "@/services/incidents/status-transitions";
import { timestampFieldsForStatus } from "@/services/incidents/sla";
import {
  assertAssetInOrg,
  assertAssigneeInOrg,
  assertClientInOrg,
  getIncidentOrThrow,
  mapFindingSeverityToIncident,
} from "@/services/incidents/shared";

export async function createIncident(input: {
  organizationId: string;
  actorId: string;
  data: CreateIncidentInput;
}): Promise<{ id: string }> {
  const { organizationId, actorId, data } = input;

  await assertClientInOrg(organizationId, data.clientId);
  if (data.assetId) {
    await assertAssetInOrg(organizationId, data.assetId, data.clientId);
  }
  if (data.assignedToUserId) {
    await assertAssigneeInOrg(organizationId, data.assignedToUserId);
  }

  const now = new Date();
  const title = sanitizeIncidentText(data.title, 300) ?? data.title;
  const description =
    sanitizeIncidentText(data.description) ?? data.description;
  const businessImpact = sanitizeIncidentText(data.businessImpact, 2000);
  const technicalImpact = sanitizeIncidentText(data.technicalImpact, 2000);

  const incident = await prisma.$transaction(async (tx) => {
    const caseNumber = await allocateNextCaseNumber(organizationId, tx);

    const created = await tx.incident.create({
      data: {
        organizationId,
        clientId: data.clientId,
        assetId: data.assetId,
        caseNumber,
        title,
        description,
        severity: data.severity,
        status: "OPEN",
        category: data.category,
        source: data.source ?? "MANUAL",
        detectionMethod: data.detectionMethod ?? "MANUAL",
        externalSourceId: data.externalSourceId ?? null,
        assignedToUserId: data.assignedToUserId,
        createdByUserId: actorId,
        occurredAt: data.occurredAt ? new Date(data.occurredAt) : null,
        detectedAt: now,
        reportedAt: now,
        businessImpact,
        technicalImpact,
      },
    });

    await tx.incidentActivity.create({
      data: {
        organizationId,
        incidentId: created.id,
        actorUserId: actorId,
        activityType: "CREATED",
        message: `Incident created: ${title}`,
        metadata: {
          severity: data.severity,
          category: data.category,
          source: data.source ?? "MANUAL",
        },
      },
    });

    if (data.findingId) {
      const finding = await tx.finding.findFirst({
        where: { id: data.findingId, organizationId },
        select: { id: true, title: true },
      });
      if (!finding) throw new Error("Finding not found");

      await tx.incidentFinding.create({
        data: {
          organizationId,
          incidentId: created.id,
          findingId: finding.id,
          linkedByUserId: actorId,
        },
      });
      await tx.incidentActivity.create({
        data: {
          organizationId,
          incidentId: created.id,
          actorUserId: actorId,
          activityType: "FINDING_LINKED",
          message: `Finding linked: ${finding.title}`,
          metadata: { findingId: finding.id },
        },
      });
    }

    if (data.assignedToUserId) {
      await tx.incidentActivity.create({
        data: {
          organizationId,
          incidentId: created.id,
          actorUserId: actorId,
          activityType: "ASSIGNED",
          message: "Incident assigned",
          metadata: { assignedToUserId: data.assignedToUserId },
        },
      });
    }

    return created;
  });

  await createAuditLog({
    organizationId,
    actorId,
    action: "INCIDENT_CREATED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: {
      title: incident.title,
      caseNumber: incident.caseNumber,
      severity: data.severity,
      category: data.category,
      clientId: data.clientId,
      source: data.source ?? "MANUAL",
    },
  });

  // Snapshot effective SLA obligation if HIGH/CRITICAL policy exists.
  // No backfill for historical incidents; no snapshot when NO_POLICY.
  await createIncidentSlaSnapshot({
    organizationId,
    actorId,
    incident,
    reason: "CREATED",
  });

  // Phase 4b: immediate in-app notifications (never from page loads).
  if (data.severity === "CRITICAL") {
    await notifyCriticalIncidentCreated({
      organizationId,
      incidentId: incident.id,
      title: incident.title,
      caseNumber: incident.caseNumber,
      clientId: incident.clientId,
      assetId: incident.assetId,
    });
  }
  if (data.assignedToUserId) {
    const generation = await countIncidentAssignmentGeneration(
      organizationId,
      incident.id
    );
    await notifyIncidentAssigned({
      organizationId,
      incidentId: incident.id,
      title: incident.title,
      assigneeUserId: data.assignedToUserId,
      clientId: incident.clientId,
      assetId: incident.assetId,
      assignmentGeneration: generation,
    });
  }

  const { logger, metrics, updateObservabilityContext, workflowCorrelationId } =
    await import("@/lib/observability");
  updateObservabilityContext({
    organizationId,
    userId: actorId,
    incidentId: incident.id,
    correlationId: workflowCorrelationId("incident", incident.id),
  });
  metrics.inc("incidents_created");
  logger.info("incident.created", {
    action: "createIncident",
    incidentId: incident.id,
    severity: data.severity,
    clientId: data.clientId,
  });

  return { id: incident.id };
}

export async function escalateFindingToIncident(input: {
  organizationId: string;
  actorId: string;
  data: EscalateFindingInput;
}): Promise<{ id: string }> {
  const finding = await prisma.finding.findFirst({
    where: { id: input.data.findingId, organizationId: input.organizationId },
    select: {
      id: true,
      title: true,
      severity: true,
      clientId: true,
      assetId: true,
      description: true,
    },
  });
  if (!finding) throw new Error("Finding not found");
  if (!finding.clientId) {
    throw new Error("Finding must be associated with a client to escalate");
  }

  const severity =
    input.data.severity ?? mapFindingSeverityToIncident(finding.severity);
  const title =
    sanitizeIncidentText(
      input.data.title ?? `Security Incident: ${finding.title}`,
      300
    ) ?? `Security Incident: ${finding.title}`;

  const description =
    sanitizeIncidentText(
      input.data.description ??
        `Escalated from finding "${finding.title}" (${finding.id}). Analyst-confirmed incident — scanner evidence not copied.`
    ) ??
    `Escalated from finding "${finding.title}". Analyst-confirmed incident — scanner evidence not copied.`;

  return createIncident({
    organizationId: input.organizationId,
    actorId: input.actorId,
    data: {
      clientId: finding.clientId,
      assetId: finding.assetId,
      title,
      description,
      severity,
      category: input.data.category ?? "VULNERABILITY_EXPLOITATION",
      source: "FINDING",
      detectionMethod: "VULNERABILITY_SCANNER",
      assignedToUserId: null,
      occurredAt: null,
      businessImpact: null,
      technicalImpact: null,
      findingId: finding.id,
    },
  });
}

export async function updateIncidentStatus(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  status: IncidentStatus;
  reason?: string | null;
  closingNote?: string | null;
}): Promise<{ id: string; status: IncidentStatus }> {
  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );
  assertIncidentTransition(incident.status, input.status);

  const isReopen =
    (incident.status === "RESOLVED" || incident.status === "CLOSED") &&
    input.status === "INVESTIGATING";

  if (isReopen) {
    const reason = sanitizeIncidentText(input.reason, 2000);
    if (!reason) {
      throw new Error("Reopening an incident requires a reason");
    }
  }

  if (input.status === "CLOSED") {
    requireClosureOk(
      await assertCanCloseIncident({
        organizationId: input.organizationId,
        incidentId: input.incidentId,
        closingNote: input.closingNote ?? "",
      })
    );
  }

  const now = new Date();
  const stamps = timestampFieldsForStatus(input.status, now);

  // Only set timestamps if not already set (preserve first transition time)
  const data: Prisma.IncidentUpdateInput = {
    status: input.status,
  };
  if (stamps.acknowledgedAt && !incident.acknowledgedAt) {
    data.acknowledgedAt = stamps.acknowledgedAt;
  }
  if (stamps.investigationStartedAt && !incident.investigationStartedAt) {
    data.investigationStartedAt = stamps.investigationStartedAt;
  }
  if (stamps.containedAt && !incident.containedAt) {
    data.containedAt = stamps.containedAt;
  }
  if (stamps.eradicatedAt && !incident.eradicatedAt) {
    data.eradicatedAt = stamps.eradicatedAt;
  }
  if (stamps.recoveringAt && !incident.recoveringAt) {
    data.recoveringAt = stamps.recoveringAt;
  }
  if (stamps.resolvedAt) {
    data.resolvedAt = stamps.resolvedAt;
  }
  if (stamps.closedAt) {
    data.closedAt = stamps.closedAt;
  }
  // Reopen clears closed/resolved terminal markers when returning to investigation
  if (
    incident.status === "RESOLVED" ||
    incident.status === "CLOSED"
  ) {
    if (input.status === "INVESTIGATING") {
      data.closedAt = null;
      data.resolvedAt = null;
    }
  }

  await prisma.incident.update({
    where: { id: incident.id },
    data,
  });

  let activityType: IncidentActivityType = "STATUS_CHANGED";
  if (input.status === "ACKNOWLEDGED") activityType = "ACKNOWLEDGED";
  else if (input.status === "RESOLVED") activityType = "RESOLVED";
  else if (input.status === "CLOSED") activityType = "CLOSED";
  else if (isReopen) activityType = "REOPENED";

  const reopenReason = sanitizeIncidentText(input.reason, 2000);
  const closingNote = sanitizeIncidentText(input.closingNote, 5000);

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: incident.id,
    actorUserId: input.actorId,
    activityType,
    message: isReopen
      ? `Incident reopened (${incident.status} → ${input.status}): ${reopenReason}`
      : input.status === "CLOSED" && closingNote
        ? `Incident closed: ${closingNote}`
        : `Status changed from ${incident.status} to ${input.status}`,
    metadata: {
      from: incident.status,
      to: input.status,
      ...(isReopen ? { reason: reopenReason } : {}),
      ...(input.status === "CLOSED" ? { closingNote } : {}),
    },
  });

  if (input.status === "CLOSED" && closingNote) {
    await prisma.incidentNote.create({
      data: {
        organizationId: input.organizationId,
        incidentId: incident.id,
        authorUserId: input.actorId,
        content: closingNote,
      },
    });
  }

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: isReopen
      ? "INCIDENT_REOPENED"
      : input.status === "ACKNOWLEDGED"
        ? "INCIDENT_ACKNOWLEDGED"
        : input.status === "INVESTIGATING" && incident.status === "ACKNOWLEDGED"
          ? "INCIDENT_INVESTIGATION_STARTED"
          : input.status === "RESOLVED"
            ? "INCIDENT_RESOLVED"
            : input.status === "CLOSED"
              ? "INCIDENT_CLOSED"
              : "INCIDENT_STATUS_CHANGED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: {
      from: incident.status,
      to: input.status,
      ...(isReopen ? { reason: reopenReason } : {}),
    },
  });

  if (input.status === "RESOLVED") {
    await notifyIncidentResolved({
      organizationId: input.organizationId,
      incidentId: incident.id,
      title: incident.title,
      actorId: input.actorId,
      assigneeUserId: incident.assignedToUserId,
      leadAnalystUserId: incident.leadAnalystUserId,
      commanderUserId: incident.commanderUserId,
      clientId: incident.clientId,
      assetId: incident.assetId,
    });
  }

  // Reopen starts a new SLA generation from CURRENT policy (previous snapshot retained).
  if (isReopen) {
    await createIncidentSlaSnapshot({
      organizationId: input.organizationId,
      actorId: input.actorId,
      incident: {
        id: incident.id,
        organizationId: incident.organizationId,
        clientId: incident.clientId,
        severity: incident.severity,
      },
      reason: "REOPENED",
    });
  }

  return { id: incident.id, status: input.status };
}

export async function updateIncidentSeverity(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  severity: IncidentSeverity;
}): Promise<void> {
  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );
  if (incident.severity === input.severity) return;

  await prisma.incident.update({
    where: { id: incident.id },
    data: { severity: input.severity },
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: incident.id,
    actorUserId: input.actorId,
    activityType: "SEVERITY_CHANGED",
    message: `Severity changed from ${incident.severity} to ${input.severity}`,
    metadata: { from: incident.severity, to: input.severity },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_SEVERITY_CHANGED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: { from: incident.severity, to: input.severity },
  });
}

export async function assignIncident(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  data: AssignIncidentInput;
}): Promise<void> {
  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );

  if (input.data.assignedToUserId) {
    await assertAssigneeInOrg(
      input.organizationId,
      input.data.assignedToUserId
    );
  }

  await prisma.incident.update({
    where: { id: incident.id },
    data: { assignedToUserId: input.data.assignedToUserId },
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: incident.id,
    actorUserId: input.actorId,
    activityType: "ASSIGNED",
    message: input.data.assignedToUserId
      ? "Incident assignment updated"
      : "Incident unassigned",
    metadata: {
      from: incident.assignedToUserId,
      to: input.data.assignedToUserId,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_ASSIGNED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: {
      from: incident.assignedToUserId,
      to: input.data.assignedToUserId,
    },
  });

  if (input.data.assignedToUserId) {
    const generation = await countIncidentAssignmentGeneration(
      input.organizationId,
      incident.id
    );
    await notifyIncidentAssigned({
      organizationId: input.organizationId,
      incidentId: incident.id,
      title: incident.title,
      assigneeUserId: input.data.assignedToUserId,
      clientId: incident.clientId,
      assetId: incident.assetId,
      assignmentGeneration: generation,
    });
  }
}

export async function updateIncidentResponse(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  data: UpdateIncidentResponseInput;
}): Promise<void> {
  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );

  const sanitized = {
    rootCause: sanitizeIncidentText(input.data.rootCause),
    containmentSummary: sanitizeIncidentText(input.data.containmentSummary),
    eradicationSummary: sanitizeIncidentText(input.data.eradicationSummary),
    recoverySummary: sanitizeIncidentText(input.data.recoverySummary),
    resolutionSummary: sanitizeIncidentText(input.data.resolutionSummary),
    lessonsLearned: sanitizeIncidentText(input.data.lessonsLearned),
    businessImpact: sanitizeIncidentText(input.data.businessImpact, 2000),
    technicalImpact: sanitizeIncidentText(input.data.technicalImpact, 2000),
    impactSummary: sanitizeIncidentText(input.data.impactSummary),
    scopeSummary: sanitizeIncidentText(input.data.scopeSummary),
    whatWentWell: sanitizeIncidentText(input.data.whatWentWell),
    whatCouldImprove: sanitizeIncidentText(input.data.whatCouldImprove),
    followUpActions: sanitizeIncidentText(input.data.followUpActions),
  };

  const data: Prisma.IncidentUpdateInput = {};
  const activities: {
    type: IncidentActivityType;
    message: string;
    field: string;
  }[] = [];

  const fieldMap: {
    key: keyof typeof sanitized;
    type: IncidentActivityType;
    label: string;
  }[] = [
    { key: "rootCause", type: "INVESTIGATION_UPDATED", label: "Root cause" },
    {
      key: "containmentSummary",
      type: "CONTAINMENT_UPDATED",
      label: "Containment",
    },
    {
      key: "eradicationSummary",
      type: "ERADICATION_UPDATED",
      label: "Eradication",
    },
    { key: "recoverySummary", type: "RECOVERY_UPDATED", label: "Recovery" },
    {
      key: "resolutionSummary",
      type: "RESOLUTION_UPDATED",
      label: "Resolution",
    },
    { key: "lessonsLearned", type: "LESSONS_UPDATED", label: "Lessons learned" },
    {
      key: "impactSummary",
      type: "POST_INCIDENT_UPDATED",
      label: "Impact summary",
    },
    {
      key: "scopeSummary",
      type: "POST_INCIDENT_UPDATED",
      label: "Scope summary",
    },
    {
      key: "whatWentWell",
      type: "POST_INCIDENT_UPDATED",
      label: "What went well",
    },
    {
      key: "whatCouldImprove",
      type: "POST_INCIDENT_UPDATED",
      label: "What could improve",
    },
    {
      key: "followUpActions",
      type: "POST_INCIDENT_UPDATED",
      label: "Follow-up actions",
    },
  ];

  for (const { key, type, label } of fieldMap) {
    if (input.data[key as keyof UpdateIncidentResponseInput] !== undefined) {
      (data as Record<string, string | null>)[key] = sanitized[key];
      activities.push({
        type,
        message: `${label} updated`,
        field: key,
      });
    }
  }
  if (input.data.businessImpact !== undefined) {
    data.businessImpact = sanitized.businessImpact;
  }
  if (input.data.technicalImpact !== undefined) {
    data.technicalImpact = sanitized.technicalImpact;
  }

  await prisma.incident.update({
    where: { id: incident.id },
    data,
  });

  for (const activity of activities) {
    await appendIncidentActivity({
      organizationId: input.organizationId,
      incidentId: incident.id,
      actorUserId: input.actorId,
      activityType: activity.type,
      message: activity.message,
      metadata: { field: activity.field },
    });
  }

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_RESPONSE_UPDATED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: { fields: activities.map((a) => a.field) },
  });
}

export async function addIncidentNote(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  content: string;
}): Promise<void> {
  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );
  const content = sanitizeIncidentText(input.content);
  if (!content) throw new Error("Note cannot be empty");

  await prisma.incidentNote.create({
    data: {
      organizationId: input.organizationId,
      incidentId: incident.id,
      authorUserId: input.actorId,
      content,
    },
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: incident.id,
    actorUserId: input.actorId,
    activityType: "NOTE_ADDED",
    message: "Analyst note added",
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_NOTE_ADDED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: { contentPreview: content.slice(0, 120) },
  });
}

export async function linkFindingToIncident(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  findingId: string;
}): Promise<void> {
  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );
  const finding = await prisma.finding.findFirst({
    where: { id: input.findingId, organizationId: input.organizationId },
    select: { id: true, title: true, clientId: true },
  });
  if (!finding) throw new Error("Finding not found");

  assertMatchesTargetClient({
    sourceClientId: finding.clientId,
    targetClientId: incident.clientId,
    context: "finding → incident",
  });

  const existing = await prisma.incidentFinding.findUnique({
    where: {
      incidentId_findingId: {
        incidentId: incident.id,
        findingId: finding.id,
      },
    },
  });
  if (existing) throw new Error("Finding is already linked to this incident");

  await prisma.incidentFinding.create({
    data: {
      organizationId: input.organizationId,
      incidentId: incident.id,
      findingId: finding.id,
      linkedByUserId: input.actorId,
    },
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: incident.id,
    actorUserId: input.actorId,
    activityType: "FINDING_LINKED",
    message: `Finding linked: ${finding.title}`,
    metadata: { findingId: finding.id },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_FINDING_LINKED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: { findingId: finding.id },
  });
}

export async function unlinkFindingFromIncident(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  findingId: string;
}): Promise<void> {
  const incident = await getIncidentOrThrow(
    input.organizationId,
    input.incidentId
  );

  const link = await prisma.incidentFinding.findFirst({
    where: {
      organizationId: input.organizationId,
      incidentId: incident.id,
      findingId: input.findingId,
    },
    include: { finding: { select: { title: true } } },
  });
  if (!link) throw new Error("Finding link not found");

  await prisma.incidentFinding.delete({ where: { id: link.id } });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: incident.id,
    actorUserId: input.actorId,
    activityType: "FINDING_UNLINKED",
    message: `Finding unlinked: ${link.finding.title}`,
    metadata: { findingId: input.findingId },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_FINDING_UNLINKED",
    resourceType: "Incident",
    resourceId: incident.id,
    metadata: { findingId: input.findingId },
  });
}
