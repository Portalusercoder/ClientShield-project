"use server";

import { revalidatePath } from "next/cache";
import { assertMinimumRole, requireSession } from "@/lib/auth";
import {
  acceptCorrelationCandidateSchema,
  addInvestigationEventSchema,
  createIncidentFromInvestigationSchema,
  createInvestigationSchema,
  dismissInvestigationSchema,
  linkInvestigationToIncidentSchema,
  rejectCorrelationCandidateSchema,
  removeInvestigationEventSchema,
  threatIntelLookupSchema,
} from "@/lib/validations/investigations";
import { rejectCandidate } from "@/services/investigations/correlation.service";
import {
  acceptCandidateIntoInvestigation,
  addEvent,
  confirmInvestigation,
  createIncidentFromInvestigation,
  createInvestigation,
  dismissInvestigation,
  linkToIncident,
  removeEvent,
  startInvestigation,
} from "@/services/investigations/investigation.service";
import { manualLookup } from "@/services/investigations/threat-intel.service";
import type { ActionResult } from "@/types/investigations";

function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: "An unexpected error occurred" };
}

function emptyToNull(v: FormDataEntryValue | null) {
  if (v == null || v === "") return null;
  return String(v);
}

function revalidateInvestigationPaths(groupId?: string) {
  revalidatePath("/investigations");
  revalidatePath("/");
  if (groupId) revalidatePath(`/investigations/${groupId}`);
}

export async function createInvestigationAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const rawIds = String(formData.get("securityEventIds") ?? "");
    const securityEventIds = rawIds
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter(Boolean);

    const parsed = createInvestigationSchema.safeParse({
      title: formData.get("title"),
      summary: emptyToNull(formData.get("summary")),
      severity: emptyToNull(formData.get("severity")) ?? undefined,
      securityEventIds,
      groupingExplanation: emptyToNull(formData.get("groupingExplanation")),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const group = await createInvestigation({
      organizationId: session.organizationId,
      actorId: session.userId,
      data: parsed.data,
    });

    revalidateInvestigationPaths(group.id);
    return { success: true, data: { id: group.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addEventAction(
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = addInvestigationEventSchema.safeParse({
      groupId: formData.get("groupId"),
      securityEventId: formData.get("securityEventId"),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    await addEvent({
      organizationId: session.organizationId,
      actorId: session.userId,
      groupId: parsed.data.groupId,
      securityEventId: parsed.data.securityEventId,
    });

    revalidateInvestigationPaths(parsed.data.groupId);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeEventAction(
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = removeInvestigationEventSchema.safeParse({
      groupId: formData.get("groupId"),
      securityEventId: formData.get("securityEventId"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    await removeEvent({
      organizationId: session.organizationId,
      actorId: session.userId,
      groupId: parsed.data.groupId,
      securityEventId: parsed.data.securityEventId,
      reason: parsed.data.reason,
    });

    revalidateInvestigationPaths(parsed.data.groupId);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function startInvestigationAction(
  groupId: string
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    await startInvestigation({
      organizationId: session.organizationId,
      actorId: session.userId,
      groupId,
    });

    revalidateInvestigationPaths(groupId);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function confirmInvestigationAction(
  groupId: string
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    await confirmInvestigation({
      organizationId: session.organizationId,
      actorId: session.userId,
      groupId,
    });

    revalidateInvestigationPaths(groupId);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function dismissInvestigationAction(
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = dismissInvestigationSchema.safeParse({
      groupId: formData.get("groupId"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    await dismissInvestigation({
      organizationId: session.organizationId,
      actorId: session.userId,
      groupId: parsed.data.groupId,
      reason: parsed.data.reason,
    });

    revalidateInvestigationPaths(parsed.data.groupId);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function acceptCandidateAction(
  formData: FormData
): Promise<ActionResult<{ investigationGroupId: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = acceptCorrelationCandidateSchema.safeParse({
      candidateId: formData.get("candidateId"),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const result = await acceptCandidateIntoInvestigation({
      organizationId: session.organizationId,
      actorId: session.userId,
      candidateId: parsed.data.candidateId,
    });

    revalidateInvestigationPaths(result.investigationGroupId);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function rejectCandidateAction(
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = rejectCorrelationCandidateSchema.safeParse({
      candidateId: formData.get("candidateId"),
      reason: emptyToNull(formData.get("reason")) ?? undefined,
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    await rejectCandidate({
      organizationId: session.organizationId,
      actorId: session.userId,
      candidateId: parsed.data.candidateId,
      reason: parsed.data.reason,
    });

    const groupId = emptyToNull(formData.get("groupId")) ?? undefined;
    revalidateInvestigationPaths(groupId);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function linkToIncidentAction(
  formData: FormData
): Promise<ActionResult<{ incidentId: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const confirm = formData.get("confirm");
    if (confirm !== "true" && confirm !== "on") {
      return {
        success: false,
        error: "Confirmation is required to link an investigation to an incident",
      };
    }

    const parsed = linkInvestigationToIncidentSchema.safeParse({
      groupId: formData.get("groupId"),
      incidentId: formData.get("incidentId"),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const result = await linkToIncident({
      organizationId: session.organizationId,
      actorId: session.userId,
      groupId: parsed.data.groupId,
      incidentId: parsed.data.incidentId,
    });

    revalidateInvestigationPaths(parsed.data.groupId);
    revalidatePath(`/incidents/${result.incidentId}`);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function createIncidentFromInvestigationAction(
  formData: FormData
): Promise<ActionResult<{ incidentId: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = createIncidentFromInvestigationSchema.safeParse({
      groupId: formData.get("groupId"),
      title: emptyToNull(formData.get("title")) ?? undefined,
      description: emptyToNull(formData.get("description")) ?? undefined,
      severity: emptyToNull(formData.get("severity")) ?? undefined,
      confirm: formData.get("confirm") === "true" || formData.get("confirm") === "on"
        ? true
        : formData.get("confirm"),
    });
    if (!parsed.success) {
      return {
        success: false,
        error:
          parsed.error.errors[0]?.message ??
          "Confirmation is required to create an incident from this investigation",
      };
    }

    const result = await createIncidentFromInvestigation({
      organizationId: session.organizationId,
      actorId: session.userId,
      groupId: parsed.data.groupId,
      title: parsed.data.title,
      description: parsed.data.description,
      severity: parsed.data.severity,
    });

    revalidateInvestigationPaths(parsed.data.groupId);
    revalidatePath("/incidents");
    revalidatePath(`/incidents/${result.incidentId}`);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function manualThreatIntelLookupAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = threatIntelLookupSchema.safeParse({
      observableId: formData.get("observableId"),
      confirm:
        formData.get("confirm") === "true" || formData.get("confirm") === "on"
          ? true
          : formData.get("confirm"),
    });
    if (!parsed.success) {
      return {
        success: false,
        error:
          parsed.error.errors[0]?.message ??
          "Confirmation is required for threat intelligence lookup",
      };
    }

    const groupId = emptyToNull(formData.get("groupId")) ?? undefined;

    const result = await manualLookup({
      organizationId: session.organizationId,
      actorId: session.userId,
      observableId: parsed.data.observableId,
      investigationGroupId: groupId ?? undefined,
    });

    if (groupId) revalidateInvestigationPaths(groupId);
    else revalidatePath("/investigations");

    return { success: true, data: { id: result.id } };
  } catch (error) {
    return toActionError(error);
  }
}
