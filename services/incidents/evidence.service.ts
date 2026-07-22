import type { EvidenceType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sanitizeIncidentText } from "@/lib/incidents/sanitize";
import { createAuditLog } from "@/services/audit.service";
import { appendIncidentActivity } from "@/services/incidents/activity";

const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

export function assertValidEvidenceUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("Invalid evidence URL");
  }
  if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("Evidence URL must use http or https");
  }
  return parsed.toString();
}

function assertSafeUrl(url: string): string {
  return assertValidEvidenceUrl(url);
}

async function getIncidentOrThrow(organizationId: string, incidentId: string) {
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, organizationId },
    select: { id: true },
  });
  if (!incident) throw new Error("Incident not found");
  return incident;
}

export async function listEvidence(
  organizationId: string,
  incidentId: string
) {
  await getIncidentOrThrow(organizationId, incidentId);
  return prisma.incidentEvidence.findMany({
    where: { organizationId, incidentId },
    orderBy: { collectedAt: "desc" },
    include: {
      collectedBy: { select: { name: true, email: true } },
    },
  });
}

export async function addNoteEvidence(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  title: string;
  description?: string | null;
  url?: string | null;
}): Promise<{ id: string }> {
  await getIncidentOrThrow(input.organizationId, input.incidentId);
  const title = sanitizeIncidentText(input.title, 300) ?? input.title;
  const description = sanitizeIncidentText(input.description, 5000);
  const url = input.url ? assertSafeUrl(input.url) : null;

  const evidence = await prisma.incidentEvidence.create({
    data: {
      organizationId: input.organizationId,
      incidentId: input.incidentId,
      type: "NOTE",
      title,
      description,
      sourceType: "NOTE",
      url,
      collectedByUserId: input.actorId,
    },
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: input.incidentId,
    actorUserId: input.actorId,
    activityType: "EVIDENCE_ADDED",
    message: `Evidence note added: ${title}`,
    metadata: { evidenceId: evidence.id, type: "NOTE" },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_EVIDENCE_ADDED",
    resourceType: "IncidentEvidence",
    resourceId: evidence.id,
    metadata: { incidentId: input.incidentId, type: "NOTE" },
  });

  return { id: evidence.id };
}

export async function linkSecurityEventEvidence(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  securityEventId: string;
}): Promise<{ id: string }> {
  await getIncidentOrThrow(input.organizationId, input.incidentId);

  const se = await prisma.securityEvent.findFirst({
    where: {
      id: input.securityEventId,
      organizationId: input.organizationId,
    },
    select: { id: true, title: true },
  });
  if (!se) throw new Error("Security Event not found in this organization");

  const existing = await prisma.incidentEvidence.findFirst({
    where: {
      organizationId: input.organizationId,
      incidentId: input.incidentId,
      type: "SECURITY_EVENT",
      sourceReferenceId: se.id,
    },
    select: { id: true },
  });
  if (existing) {
    throw new Error("Security Event already linked as evidence");
  }

  const title =
    sanitizeIncidentText(`Security Event: ${se.title}`, 300) ??
    `Security Event: ${se.title}`;

  const evidence = await prisma.incidentEvidence.create({
    data: {
      organizationId: input.organizationId,
      incidentId: input.incidentId,
      type: "SECURITY_EVENT",
      title,
      sourceType: "SECURITY_EVENT",
      sourceReferenceId: se.id,
      collectedByUserId: input.actorId,
    },
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: input.incidentId,
    actorUserId: input.actorId,
    activityType: "EVIDENCE_ADDED",
    message: `Security Event linked as evidence: ${se.title}`,
    metadata: {
      evidenceId: evidence.id,
      type: "SECURITY_EVENT",
      securityEventId: se.id,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_EVIDENCE_ADDED",
    resourceType: "IncidentEvidence",
    resourceId: evidence.id,
    metadata: {
      incidentId: input.incidentId,
      type: "SECURITY_EVENT",
      securityEventId: se.id,
    },
  });

  return { id: evidence.id };
}

export async function linkFindingEvidence(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  findingId: string;
}): Promise<{ id: string }> {
  await getIncidentOrThrow(input.organizationId, input.incidentId);

  const finding = await prisma.finding.findFirst({
    where: { id: input.findingId, organizationId: input.organizationId },
    select: { id: true, title: true },
  });
  if (!finding) throw new Error("Finding not found in this organization");

  const existing = await prisma.incidentEvidence.findFirst({
    where: {
      organizationId: input.organizationId,
      incidentId: input.incidentId,
      type: "FINDING",
      sourceReferenceId: finding.id,
    },
    select: { id: true },
  });
  if (existing) {
    throw new Error("Finding already linked as evidence");
  }

  const title =
    sanitizeIncidentText(`Finding: ${finding.title}`, 300) ??
    `Finding: ${finding.title}`;

  const evidence = await prisma.incidentEvidence.create({
    data: {
      organizationId: input.organizationId,
      incidentId: input.incidentId,
      type: "FINDING" satisfies EvidenceType,
      title,
      sourceType: "FINDING",
      sourceReferenceId: finding.id,
      collectedByUserId: input.actorId,
    },
  });

  await appendIncidentActivity({
    organizationId: input.organizationId,
    incidentId: input.incidentId,
    actorUserId: input.actorId,
    activityType: "EVIDENCE_ADDED",
    message: `Finding linked as evidence: ${finding.title}`,
    metadata: {
      evidenceId: evidence.id,
      type: "FINDING",
      findingId: finding.id,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "INCIDENT_EVIDENCE_ADDED",
    resourceType: "IncidentEvidence",
    resourceId: evidence.id,
    metadata: {
      incidentId: input.incidentId,
      type: "FINDING",
      findingId: finding.id,
    },
  });

  return { id: evidence.id };
}
