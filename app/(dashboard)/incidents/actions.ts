"use server";

import { revalidatePath } from "next/cache";
import { assertMinimumRole, requireSession } from "@/lib/auth";
import {
  addIncidentNoteSchema,
  assignIncidentSchema,
  createIncidentSchema,
  escalateFindingSchema,
  linkFindingSchema,
  updateIncidentResponseSchema,
  updateIncidentSeveritySchema,
  updateIncidentStatusSchema,
} from "@/lib/validations/incidents";
import {
  addEvidenceNoteSchema,
  assignPlaybookSchema,
  assignResponseTaskSchema,
  createResponseTaskSchema,
  linkEvidenceFindingSchema,
  linkEvidenceSecurityEventSchema,
  setCommanderSchema,
  setLeadAnalystSchema,
  setResponseTaskStatusSchema,
} from "@/lib/validations/incident-case";
import { generateIncidentCasePdf } from "@/services/reports/incident-case-pdf.service";
import { addNoteEvidence, linkFindingEvidence, linkSecurityEventEvidence } from "@/services/incidents/evidence.service";
import { setCommander, setLeadAnalyst } from "@/services/incidents/ownership.service";
import { assignPlaybookToIncident } from "@/services/incidents/playbook.service";
import {
  assignResponseTask,
  createResponseTask,
  updateResponseTaskStatus,
} from "@/services/incidents/response-task.service";
import {
  addIncidentNote,
  assignIncident,
  createIncident,
  escalateFindingToIncident,
  getIncidentById,
  linkFindingToIncident,
  searchFindingsForLink,
  unlinkFindingFromIncident,
  updateIncidentResponse,
  updateIncidentSeverity,
  updateIncidentStatus,
} from "@/services/incidents.service";
import type { ActionResult } from "@/types/incidents";

function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: "An unexpected error occurred" };
}

function revalidateIncidentPaths(
  incidentId: string,
  extra?: { clientId?: string; assetId?: string; findingId?: string }
) {
  revalidatePath("/incidents");
  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath("/");
  if (extra?.clientId) revalidatePath(`/clients/${extra.clientId}`);
  if (extra?.assetId) revalidatePath(`/assets/${extra.assetId}`);
  if (extra?.findingId) revalidatePath(`/vulnerabilities/${extra.findingId}`);
}

export async function createIncidentAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const emptyToNull = (v: FormDataEntryValue | null) => {
      if (v == null || v === "") return null;
      return String(v);
    };

    const parsed = createIncidentSchema.safeParse({
      clientId: formData.get("clientId"),
      assetId: emptyToNull(formData.get("assetId")),
      title: formData.get("title"),
      description: emptyToNull(formData.get("description")),
      severity: formData.get("severity"),
      category: formData.get("category"),
      source: formData.get("source") || "MANUAL",
      detectionMethod: formData.get("detectionMethod") || "MANUAL",
      assignedToUserId: emptyToNull(formData.get("assignedToUserId")),
      occurredAt: emptyToNull(formData.get("occurredAt")),
      businessImpact: emptyToNull(formData.get("businessImpact")),
      technicalImpact: emptyToNull(formData.get("technicalImpact")),
      findingId: emptyToNull(formData.get("findingId")),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const result = await createIncident({
      organizationId: session.organizationId,
      actorId: session.userId,
      data: parsed.data,
    });

    revalidateIncidentPaths(result.id, {
      clientId: parsed.data.clientId,
      assetId: parsed.data.assetId ?? undefined,
      findingId: parsed.data.findingId ?? undefined,
    });

    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function escalateFindingAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const emptyToNull = (v: FormDataEntryValue | null) => {
      if (v == null || v === "") return null;
      return String(v);
    };

    const parsed = escalateFindingSchema.safeParse({
      findingId: formData.get("findingId"),
      title: emptyToNull(formData.get("title")) ?? undefined,
      description: emptyToNull(formData.get("description")),
      severity: emptyToNull(formData.get("severity")) ?? undefined,
      category:
        emptyToNull(formData.get("category")) ??
        "VULNERABILITY_EXPLOITATION",
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const result = await escalateFindingToIncident({
      organizationId: session.organizationId,
      actorId: session.userId,
      data: parsed.data,
    });

    revalidateIncidentPaths(result.id, {
      findingId: parsed.data.findingId,
    });
    revalidatePath("/vulnerabilities");

    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateIncidentStatusAction(
  incidentId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const emptyToNull = (v: FormDataEntryValue | null) => {
      if (v == null || v === "") return null;
      return String(v);
    };

    const parsed = updateIncidentStatusSchema.safeParse({
      status: formData.get("status"),
      reason: emptyToNull(formData.get("reason")),
      closingNote: emptyToNull(formData.get("closingNote")),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const current = await getIncidentById(
      session.organizationId,
      incidentId
    );
    if (!current) {
      return { success: false, error: "Incident not found" };
    }

    // Close and reopen require ADMIN+
    const isReopen =
      (current.status === "RESOLVED" || current.status === "CLOSED") &&
      parsed.data.status === "INVESTIGATING";
    if (parsed.data.status === "CLOSED" || isReopen) {
      assertMinimumRole(session, "ADMIN");
    }

    const result = await updateIncidentStatus({
      organizationId: session.organizationId,
      actorId: session.userId,
      incidentId,
      status: parsed.data.status,
      reason: parsed.data.reason,
      closingNote: parsed.data.closingNote,
    });

    revalidateIncidentPaths(result.id);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateIncidentSeverityAction(
  incidentId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = updateIncidentSeveritySchema.safeParse({
      severity: formData.get("severity"),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    await updateIncidentSeverity({
      organizationId: session.organizationId,
      actorId: session.userId,
      incidentId,
      severity: parsed.data.severity,
    });

    revalidateIncidentPaths(incidentId);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function assignIncidentAction(
  incidentId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const raw = formData.get("assignedToUserId");
    const parsed = assignIncidentSchema.safeParse({
      assignedToUserId: raw === "" || raw == null ? null : String(raw),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    await assignIncident({
      organizationId: session.organizationId,
      actorId: session.userId,
      incidentId,
      data: parsed.data,
    });

    revalidateIncidentPaths(incidentId);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateIncidentResponseAction(
  incidentId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const emptyToNull = (v: FormDataEntryValue | null) => {
      if (v == null || v === "") return null;
      return String(v);
    };

    const keys = [
      "rootCause",
      "containmentSummary",
      "eradicationSummary",
      "recoverySummary",
      "resolutionSummary",
      "lessonsLearned",
      "businessImpact",
      "technicalImpact",
      "impactSummary",
      "scopeSummary",
      "whatWentWell",
      "whatCouldImprove",
      "followUpActions",
    ] as const;

    const payload: Record<string, string | null> = {};
    for (const key of keys) {
      if (formData.has(key)) {
        payload[key] = emptyToNull(formData.get(key));
      }
    }

    const parsed = updateIncidentResponseSchema.safeParse(payload);

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    await updateIncidentResponse({
      organizationId: session.organizationId,
      actorId: session.userId,
      incidentId,
      data: parsed.data,
    });

    revalidateIncidentPaths(incidentId);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addIncidentNoteAction(
  incidentId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = addIncidentNoteSchema.safeParse({
      content: formData.get("content"),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    await addIncidentNote({
      organizationId: session.organizationId,
      actorId: session.userId,
      incidentId,
      content: parsed.data.content,
    });

    revalidateIncidentPaths(incidentId);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function linkFindingAction(
  incidentId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = linkFindingSchema.safeParse({
      findingId: formData.get("findingId"),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    await linkFindingToIncident({
      organizationId: session.organizationId,
      actorId: session.userId,
      incidentId,
      findingId: parsed.data.findingId,
    });

    revalidateIncidentPaths(incidentId, {
      findingId: parsed.data.findingId,
    });
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function unlinkFindingAction(
  incidentId: string,
  findingId: string
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    await unlinkFindingFromIncident({
      organizationId: session.organizationId,
      actorId: session.userId,
      incidentId,
      findingId,
    });

    revalidateIncidentPaths(incidentId, { findingId });
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function searchFindingsForLinkAction(input: {
  clientId?: string;
  search?: string;
}): Promise<
  ActionResult<
    {
      id: string;
      title: string;
      severity: string;
      status: string;
      assetName: string | null;
    }[]
  >
> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");
    const findings = await searchFindingsForLink({
      organizationId: session.organizationId,
      clientId: input.clientId,
      search: input.search,
    });
    return { success: true, data: findings };
  } catch (error) {
    return toActionError(error);
  }
}

function emptyToNull(v: FormDataEntryValue | null) {
  if (v == null || v === "") return null;
  return String(v);
}

export async function assignPlaybookAction(
  incidentId: string,
  formData: FormData
): Promise<ActionResult<{ instanceId: string; taskCount: number }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = assignPlaybookSchema.safeParse({
      playbookId: formData.get("playbookId"),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const result = await assignPlaybookToIncident({
      organizationId: session.organizationId,
      actorId: session.userId,
      incidentId,
      playbookId: parsed.data.playbookId,
    });

    revalidateIncidentPaths(incidentId);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function createResponseTaskAction(
  incidentId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = createResponseTaskSchema.safeParse({
      phase: formData.get("phase"),
      title: formData.get("title"),
      description: emptyToNull(formData.get("description")),
      priority: formData.get("priority") || "MEDIUM",
      isRequired: formData.get("isRequired") === "true" || formData.get("isRequired") === "on",
      assignedToUserId: emptyToNull(formData.get("assignedToUserId")),
      dueAt: emptyToNull(formData.get("dueAt")),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const result = await createResponseTask({
      organizationId: session.organizationId,
      actorId: session.userId,
      incidentId,
      phase: parsed.data.phase,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      isRequired: parsed.data.isRequired,
      assignedToUserId: parsed.data.assignedToUserId,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    });

    revalidateIncidentPaths(incidentId);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateResponseTaskStatusAction(
  incidentId: string,
  taskId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = setResponseTaskStatusSchema.safeParse({
      status: formData.get("status"),
      blockedReason: emptyToNull(formData.get("blockedReason")),
      skipReason: emptyToNull(formData.get("skipReason")),
      completionNote: emptyToNull(formData.get("completionNote")),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    await updateResponseTaskStatus({
      organizationId: session.organizationId,
      actorId: session.userId,
      taskId,
      status: parsed.data.status,
      blockedReason: parsed.data.blockedReason,
      skipReason: parsed.data.skipReason,
      completionNote: parsed.data.completionNote,
    });

    revalidateIncidentPaths(incidentId);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function assignResponseTaskAction(
  incidentId: string,
  taskId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = assignResponseTaskSchema.safeParse({
      assignedToUserId: emptyToNull(formData.get("assignedToUserId")),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    await assignResponseTask({
      organizationId: session.organizationId,
      actorId: session.userId,
      taskId,
      assignedToUserId: parsed.data.assignedToUserId,
    });

    revalidateIncidentPaths(incidentId);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addEvidenceNoteAction(
  incidentId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = addEvidenceNoteSchema.safeParse({
      title: formData.get("title"),
      description: emptyToNull(formData.get("description")),
      url: emptyToNull(formData.get("url")),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const result = await addNoteEvidence({
      organizationId: session.organizationId,
      actorId: session.userId,
      incidentId,
      title: parsed.data.title,
      description: parsed.data.description,
      url: parsed.data.url,
    });

    revalidateIncidentPaths(incidentId);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function linkEvidenceSecurityEventAction(
  incidentId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = linkEvidenceSecurityEventSchema.safeParse({
      securityEventId: formData.get("securityEventId"),
      title: emptyToNull(formData.get("title")) ?? undefined,
      description: emptyToNull(formData.get("description")),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const result = await linkSecurityEventEvidence({
      organizationId: session.organizationId,
      actorId: session.userId,
      incidentId,
      securityEventId: parsed.data.securityEventId,
    });

    revalidateIncidentPaths(incidentId);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function linkEvidenceFindingAction(
  incidentId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = linkEvidenceFindingSchema.safeParse({
      findingId: formData.get("findingId"),
      title: emptyToNull(formData.get("title")) ?? undefined,
      description: emptyToNull(formData.get("description")),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const result = await linkFindingEvidence({
      organizationId: session.organizationId,
      actorId: session.userId,
      incidentId,
      findingId: parsed.data.findingId,
    });

    revalidateIncidentPaths(incidentId);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setLeadAnalystAction(
  incidentId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = setLeadAnalystSchema.safeParse({
      leadAnalystUserId: emptyToNull(formData.get("leadAnalystUserId")),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    await setLeadAnalyst({
      organizationId: session.organizationId,
      actorId: session.userId,
      incidentId,
      leadAnalystUserId: parsed.data.leadAnalystUserId,
    });

    revalidateIncidentPaths(incidentId);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setCommanderAction(
  incidentId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const parsed = setCommanderSchema.safeParse({
      commanderUserId: emptyToNull(formData.get("commanderUserId")),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    await setCommander({
      organizationId: session.organizationId,
      actorId: session.userId,
      incidentId,
      commanderUserId: parsed.data.commanderUserId,
    });

    revalidateIncidentPaths(incidentId);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function generateIncidentCasePdfAction(
  incidentId: string
): Promise<ActionResult<{ base64: string; filename: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const { buffer, filename } = await generateIncidentCasePdf({
      organizationId: session.organizationId,
      incidentId,
    });

    return {
      success: true,
      data: {
        base64: buffer.toString("base64"),
        filename,
      },
    };
  } catch (error) {
    return toActionError(error);
  }
}
