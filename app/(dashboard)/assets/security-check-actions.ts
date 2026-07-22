"use server";

import { revalidatePath } from "next/cache";
import { assertMinimumRole, requireSession } from "@/lib/auth";
import { assetIdSchema } from "@/lib/validations/assets";
import {
  getSecurityCheckById,
  listSecurityChecks,
  runPassiveSecurityCheck,
} from "@/services/security-checks/security-check.service";
import type { SecurityCheckActionResult } from "@/types/security-check";

function toError(error: unknown): SecurityCheckActionResult<never> {
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: "Security check failed" };
}

export async function runSecurityCheckAction(
  assetId: string
): Promise<SecurityCheckActionResult<{ checkId: string; score: number | null }>> {
  try {
    // TODO: Replace with production IdP session validation.
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const idParsed = assetIdSchema.safeParse({ id: assetId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid asset ID" };
    }

    const result = await runPassiveSecurityCheck({
      organizationId: session.organizationId,
      userId: session.userId,
      assetId: idParsed.data.id,
    });

    revalidatePath(`/assets/${assetId}`);
    revalidatePath("/assets");
    revalidatePath("/");

    return {
      success: true,
      data: { checkId: result.id, score: result.overallScore },
    };
  } catch (error) {
    return toError(error);
  }
}

export async function getAssetSecurityChecksAction(assetId: string) {
  const session = await requireSession();
  const idParsed = assetIdSchema.safeParse({ id: assetId });
  if (!idParsed.success) {
    return [];
  }
  return listSecurityChecks(session.organizationId, idParsed.data.id);
}

export async function getSecurityCheckDetailAction(checkId: string) {
  const session = await requireSession();
  return getSecurityCheckById(session.organizationId, checkId);
}
