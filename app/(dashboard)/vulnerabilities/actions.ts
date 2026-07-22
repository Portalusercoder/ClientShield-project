"use server";

import { revalidatePath } from "next/cache";
import { assertMinimumRole, hasMinimumRole, requireSession } from "@/lib/auth";
import {
  assignFindingSchema,
  createRemediationTaskSchema,
  findingNoteSchema,
  updateFindingStatusSchema,
  updateFindingTriageSchema,
  updateRemediationTaskSchema,
} from "@/lib/validations/findings";
import {
  addFindingRemediationNote,
  assignFinding,
  getFindingById,
  updateFindingStatus,
  updateFindingTriage,
} from "@/services/findings.service";
import {
  createRemediationTask,
  updateRemediationTask,
} from "@/services/remediation.service";
import { verifyPassiveFindingFix } from "@/services/security-checks/verify-fix.service";
import type { ActionResult } from "@/types/findings";

function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: "An unexpected error occurred" };
}

export async function updateFindingStatusAction(
  findingId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = updateFindingStatusSchema.safeParse({
      status: formData.get("status"),
      reason: formData.get("reason") || undefined,
      validationNotes: formData.get("validationNotes") || undefined,
      acceptedRiskReviewDate:
        formData.get("acceptedRiskReviewDate") || undefined,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const canAcceptRisk = hasMinimumRole(session, "ADMIN");

    const finding = await updateFindingStatus({
      organizationId: session.organizationId,
      actorId: session.userId,
      findingId,
      data: parsed.data,
      canAcceptRisk,
    });

    revalidatePath("/vulnerabilities");
    revalidatePath(`/vulnerabilities/${finding.id}`);
    revalidatePath(`/assets/${finding.assetId}`);
    if (finding.clientId) revalidatePath(`/clients/${finding.clientId}`);
    revalidatePath("/");

    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateFindingTriageAction(
  findingId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const emptyToNull = (v: FormDataEntryValue | null) => {
      if (v == null || v === "") return null;
      return String(v);
    };

    const parsed = updateFindingTriageSchema.safeParse({
      triagePriority: emptyToNull(formData.get("triagePriority")),
      businessImpact: emptyToNull(formData.get("businessImpact")),
      exploitabilityAssessment: emptyToNull(
        formData.get("exploitabilityAssessment")
      ),
      remediationComplexity: emptyToNull(formData.get("remediationComplexity")),
      analystNotes: emptyToNull(formData.get("analystNotes")),
      validationNotes: emptyToNull(formData.get("validationNotes")),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const finding = await updateFindingTriage({
      organizationId: session.organizationId,
      actorId: session.userId,
      findingId,
      data: parsed.data,
    });

    revalidatePath(`/vulnerabilities/${finding.id}`);
    revalidatePath("/vulnerabilities");
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function assignFindingAction(
  findingId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = assignFindingSchema.safeParse({
      assignedToUserId: formData.get("assignedToUserId") ?? "",
      dueDate: formData.get("dueDate") ?? "",
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const finding = await assignFinding({
      organizationId: session.organizationId,
      actorId: session.userId,
      findingId,
      data: parsed.data,
    });

    revalidatePath("/vulnerabilities");
    revalidatePath(`/vulnerabilities/${finding.id}`);
    revalidatePath("/");

    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addFindingNoteAction(
  findingId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "VIEWER");

    const parsed = findingNoteSchema.safeParse({
      note: formData.get("note"),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const finding = await getFindingById(session.organizationId, findingId);
    if (!finding) return { success: false, error: "Finding not found" };

    const isAnalyst = ["ANALYST", "ADMIN", "OWNER"].includes(session.role);
    if (!isAnalyst && finding.assignedToUserId !== session.userId) {
      return {
        success: false,
        error: "You can only add notes to findings assigned to you",
      };
    }

    await addFindingRemediationNote({
      organizationId: session.organizationId,
      actorId: session.userId,
      findingId,
      note: parsed.data.note,
    });

    revalidatePath(`/vulnerabilities/${findingId}`);
    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function verifyFindingFixAction(
  findingId: string
): Promise<ActionResult<{ resolved: boolean; checkId: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const result = await verifyPassiveFindingFix({
      organizationId: session.organizationId,
      actorId: session.userId,
      findingId,
    });

    revalidatePath("/vulnerabilities");
    revalidatePath(`/vulnerabilities/${findingId}`);
    if (result.finding) {
      revalidatePath(`/assets/${result.finding.assetId}`);
      if (result.finding.clientId) {
        revalidatePath(`/clients/${result.finding.clientId}`);
      }
    }
    revalidatePath("/");

    return {
      success: true,
      data: { resolved: Boolean(result.resolved), checkId: result.checkId },
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function createRemediationTaskAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = createRemediationTaskSchema.safeParse({
      findingId: formData.get("findingId"),
      title: formData.get("title"),
      description: formData.get("description") || "",
      priority: formData.get("priority") || "MEDIUM",
      assignedToUserId: formData.get("assignedToUserId") || "",
      dueDate: formData.get("dueDate") || "",
      notes: formData.get("notes") || "",
      confirmUnvalidated: formData.get("confirmUnvalidated") || undefined,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const task = await createRemediationTask({
      organizationId: session.organizationId,
      actorId: session.userId,
      data: parsed.data,
    });

    revalidatePath("/remediation");
    revalidatePath(`/vulnerabilities/${parsed.data.findingId}`);
    revalidatePath("/");

    return { success: true, data: { id: task.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateRemediationTaskAction(
  taskId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "VIEWER");

    const parsed = updateRemediationTaskSchema.safeParse({
      status: formData.get("status") || undefined,
      priority: formData.get("priority") || undefined,
      assignedToUserId: formData.get("assignedToUserId") ?? undefined,
      dueDate: formData.get("dueDate") ?? undefined,
      notes: formData.get("notes") || undefined,
      title: formData.get("title") || undefined,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const isAnalyst = ["ANALYST", "ADMIN", "OWNER"].includes(session.role);
    if (!isAnalyst) {
      const { getRemediationTaskById } = await import(
        "@/services/remediation.service"
      );
      const existing = await getRemediationTaskById(
        session.organizationId,
        taskId
      );
      if (!existing || existing.assignedToUserId !== session.userId) {
        return {
          success: false,
          error: "You can only update remediation tasks assigned to you",
        };
      }
    }

    await updateRemediationTask({
      organizationId: session.organizationId,
      actorId: session.userId,
      taskId,
      data: parsed.data,
    });

    revalidatePath("/remediation");
    revalidatePath("/");

    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
