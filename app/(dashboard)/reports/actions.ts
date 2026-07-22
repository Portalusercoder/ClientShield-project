"use server";

import { revalidatePath } from "next/cache";
import { assertMinimumRole, requireSession } from "@/lib/auth";
import { generateReportSchema } from "@/lib/validations/reports";
import {
  archiveReport,
  generateSecurityPostureReport,
} from "@/services/reports/report.service";
import type { ActionResult } from "@/types/findings";

function toError(error: unknown): ActionResult<never> {
  if (error instanceof Error) return { success: false, error: error.message };
  return { success: false, error: "An unexpected error occurred" };
}

export async function generateReportAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = generateReportSchema.safeParse({
      clientId: formData.get("clientId"),
      reportType: formData.get("reportType") || "SECURITY_POSTURE",
      title: formData.get("title"),
      reportingPeriodStart: formData.get("reportingPeriodStart"),
      reportingPeriodEnd: formData.get("reportingPeriodEnd"),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const start = new Date(parsed.data.reportingPeriodStart);
    const end = new Date(parsed.data.reportingPeriodEnd);
    // Inclusive end-of-day for date-only inputs
    if (parsed.data.reportingPeriodEnd.length === 10) {
      end.setHours(23, 59, 59, 999);
    }

    const result = await generateSecurityPostureReport({
      organizationId: session.organizationId,
      actorId: session.userId,
      clientId: parsed.data.clientId,
      title: parsed.data.title,
      periodStart: start,
      periodEnd: end,
      reportType: parsed.data.reportType,
    });

    revalidatePath("/reports");
    revalidatePath(`/reports/${result.id}`);
    return { success: true, data: result };
  } catch (error) {
    return toError(error);
  }
}

export async function archiveReportAction(
  reportId: string
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    await archiveReport({
      organizationId: session.organizationId,
      actorId: session.userId,
      reportId,
    });

    revalidatePath("/reports");
    revalidatePath(`/reports/${reportId}`);
    return { success: true, data: undefined };
  } catch (error) {
    return toError(error);
  }
}
