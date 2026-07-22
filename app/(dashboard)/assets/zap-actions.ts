"use server";

import { revalidatePath } from "next/cache";
import { assertMinimumRole, requireSession } from "@/lib/auth";
import { assetIdSchema } from "@/lib/validations/assets";
import {
  getZapBaselineScanById,
  listZapBaselineScans,
  runZapBaselineScan,
} from "@/services/zap/zap-baseline.service";
import type { ZapActionResult } from "@/types/zap";

function toError(error: unknown): ZapActionResult<never> {
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: "ZAP baseline scan failed" };
}

export async function runZapBaselineScanAction(
  assetId: string
): Promise<
  ZapActionResult<{
    scanId: string;
    status: string;
    findingsCreated: number;
    findingsUpdated: number;
  }>
> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const idParsed = assetIdSchema.safeParse({ id: assetId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid asset ID" };
    }

    // Never accept a URL from the client — target is loaded from Asset in the service.
    const result = await runZapBaselineScan({
      organizationId: session.organizationId,
      userId: session.userId,
      assetId: idParsed.data.id,
    });

    revalidatePath(`/assets/${assetId}`);
    revalidatePath("/assets");
    revalidatePath("/vulnerabilities");
    revalidatePath("/");
    if (result.summary) {
      // Client page may show findings
    }

    return {
      success: true,
      data: {
        scanId: result.id,
        status: result.status,
        findingsCreated: result.findingsCreated,
        findingsUpdated: result.findingsUpdated,
      },
    };
  } catch (error) {
    return toError(error);
  }
}

export async function listZapBaselineScansAction(assetId: string) {
  const session = await requireSession();
  const idParsed = assetIdSchema.safeParse({ id: assetId });
  if (!idParsed.success) return [];
  return listZapBaselineScans(session.organizationId, idParsed.data.id);
}

export async function getZapBaselineScanDetailAction(scanId: string) {
  const session = await requireSession();
  return getZapBaselineScanById(session.organizationId, scanId);
}
