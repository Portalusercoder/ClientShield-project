"use server";

import { revalidatePath } from "next/cache";
import type { AttentionSourceType } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { assertMinimumRole } from "@/lib/auth/permissions";
import {
  AttentionConflictError,
  acknowledgeAttention,
  claimAttention,
  clearAttentionSnooze,
  releaseAttentionClaim,
  snoozeAttention,
} from "@/services/attention/attention-state.service";
import type { AttentionSnoozePreset } from "@/types/attention";

const SOURCE_TYPES = new Set<AttentionSourceType>([
  "SECURITY_EVENT",
  "FINDING",
  "INVESTIGATION",
  "INCIDENT",
]);

function parseSource(
  sourceType: string,
  sourceId: string
): { sourceType: AttentionSourceType; sourceId: string } {
  if (!SOURCE_TYPES.has(sourceType as AttentionSourceType)) {
    throw new Error("Invalid source type");
  }
  if (!sourceId || typeof sourceId !== "string") {
    throw new Error("Invalid source id");
  }
  return { sourceType: sourceType as AttentionSourceType, sourceId };
}

export async function acknowledgeAttentionAction(input: {
  sourceType: string;
  sourceId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");
    const src = parseSource(input.sourceType, input.sourceId);
    await acknowledgeAttention({ session, ...src });
    revalidatePath("/attention");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Acknowledge failed",
    };
  }
}

export async function claimAttentionAction(input: {
  sourceType: string;
  sourceId: string;
  assignToUserId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");
    const src = parseSource(input.sourceType, input.sourceId);
    await claimAttention({
      session,
      ...src,
      assignToUserId: input.assignToUserId,
    });
    revalidatePath("/attention");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    if (e instanceof AttentionConflictError) {
      return { ok: false, error: e.message };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Claim failed",
    };
  }
}

export async function releaseAttentionClaimAction(input: {
  sourceType: string;
  sourceId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");
    const src = parseSource(input.sourceType, input.sourceId);
    await releaseAttentionClaim({ session, ...src });
    revalidatePath("/attention");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Release failed",
    };
  }
}

export async function snoozeAttentionAction(input: {
  sourceType: string;
  sourceId: string;
  preset: AttentionSnoozePreset;
  customUntilIso?: string;
  criticalConfirmed?: boolean;
  severity?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");
    const src = parseSource(input.sourceType, input.sourceId);
    if (input.severity === "CRITICAL" && !input.criticalConfirmed) {
      return {
        ok: false,
        error:
          "CRITICAL snooze requires confirmation that this only hides the item for you",
      };
    }
    await snoozeAttention({
      session,
      ...src,
      preset: input.preset,
      customUntil: input.customUntilIso
        ? new Date(input.customUntilIso)
        : null,
    });
    revalidatePath("/attention");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Snooze failed",
    };
  }
}

export async function clearAttentionSnoozeAction(input: {
  sourceType: string;
  sourceId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");
    const src = parseSource(input.sourceType, input.sourceId);
    await clearAttentionSnooze({ session, ...src });
    revalidatePath("/attention");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Clear snooze failed",
    };
  }
}
