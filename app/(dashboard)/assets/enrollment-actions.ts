"use server";

import { revalidatePath } from "next/cache";
import { assertMinimumRole, requireSession } from "@/lib/auth";
import {
  enrollmentIdSchema,
  mapEnrollmentAgentSchema,
  prepareEnrollmentSchema,
} from "@/lib/validations/wazuh-enrollment";
import {
  getEnrollmentInstructions,
  mapEnrollmentToAgent,
  prepareWazuhEnrollment,
  revokeWazuhEnrollment,
  verifyWazuhEnrollment,
} from "@/services/wazuh/wazuh-enrollment.service";
import type { EnrollmentInstructions } from "@/types/wazuh-enrollment";

type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof Error) {
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return { success: false, error: error.message };
    }
    return { success: false, error: error.message };
  }
  return { success: false, error: "An unexpected error occurred" };
}

function revalidateEnrollmentPaths(assetId: string, clientId?: string) {
  revalidatePath(`/assets/${assetId}`);
  revalidatePath(`/assets/${assetId}/enrollment`);
  revalidatePath("/assets");
  revalidatePath("/integrations/wazuh");
  if (clientId) {
    revalidatePath(`/clients/${clientId}`);
    revalidatePath(`/clients/${clientId}/onboarding`);
  }
}

export async function prepareEnrollmentAction(
  formData: FormData
): Promise<
  ActionResult<{ enrollmentId: string; instructions: EnrollmentInstructions }>
> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const parsed = prepareEnrollmentSchema.safeParse({
      assetId: formData.get("assetId"),
      agentName: formData.get("agentName"),
      expectedHostname: formData.get("expectedHostname"),
      platform: formData.get("platform"),
      architecture: formData.get("architecture"),
      connectionHint: formData.get("connectionHint") || undefined,
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const result = await prepareWazuhEnrollment({
      organizationId: session.organizationId,
      actorId: session.userId,
      data: parsed.data,
    });

    revalidateEnrollmentPaths(
      result.enrollment.assetId,
      result.enrollment.clientId
    );

    return {
      success: true,
      data: {
        enrollmentId: result.enrollment.id,
        instructions: result.instructions,
      },
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function verifyEnrollmentAction(
  enrollmentId: string
): Promise<ActionResult<{ message: string; hostnameMismatch: boolean }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const idParsed = enrollmentIdSchema.safeParse({ id: enrollmentId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid enrollment ID" };
    }

    const result = await verifyWazuhEnrollment({
      organizationId: session.organizationId,
      actorId: session.userId,
      enrollmentId: idParsed.data.id,
    });

    revalidateEnrollmentPaths(
      result.enrollment.assetId,
      result.enrollment.clientId
    );

    return {
      success: true,
      data: {
        message: result.message,
        hostnameMismatch: result.hostnameMismatch,
      },
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function mapEnrollmentAction(input: {
  enrollmentId: string;
  wazuhAgentId: string;
  confirmRemap?: boolean;
}): Promise<ActionResult<{ enrollmentId: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const parsed = mapEnrollmentAgentSchema.safeParse({
      enrollmentId: input.enrollmentId,
      wazuhAgentId: input.wazuhAgentId,
      confirmRemap: input.confirmRemap ?? false,
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const enrollment = await mapEnrollmentToAgent({
      organizationId: session.organizationId,
      actorId: session.userId,
      enrollmentId: parsed.data.enrollmentId,
      wazuhAgentId: parsed.data.wazuhAgentId,
      confirmRemap: parsed.data.confirmRemap,
    });

    revalidateEnrollmentPaths(enrollment.assetId, enrollment.clientId);

    return { success: true, data: { enrollmentId: enrollment.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function revokeEnrollmentAction(
  enrollmentId: string,
  options?: { deactivateMapping?: boolean }
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const idParsed = enrollmentIdSchema.safeParse({ id: enrollmentId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid enrollment ID" };
    }

    const enrollment = await revokeWazuhEnrollment({
      organizationId: session.organizationId,
      actorId: session.userId,
      enrollmentId: idParsed.data.id,
      deactivateMapping: options?.deactivateMapping ?? true,
    });

    revalidateEnrollmentPaths(enrollment.assetId, enrollment.clientId);

    return { success: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getEnrollmentInstructionsAction(
  enrollmentId: string
): Promise<ActionResult<EnrollmentInstructions>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "VIEWER");

    const { getEnrollmentById } = await import(
      "@/services/wazuh/wazuh-enrollment.service"
    );
    const enrollment = await getEnrollmentById(
      session.organizationId,
      enrollmentId
    );
    if (!enrollment) return { success: false, error: "Enrollment not found" };

    return {
      success: true,
      data: getEnrollmentInstructions(enrollment),
    };
  } catch (error) {
    return toActionError(error);
  }
}
