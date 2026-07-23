"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { assertMinimumRole } from "@/lib/auth/permissions";
import {
  listSlaPolicies,
  setSlaPolicyEnabled,
  upsertSlaPolicy,
} from "@/services/sla/sla-policy.service";
import type { SlaMvpSeverity } from "@/types/sla";

function parseMinutes(raw: FormDataEntryValue | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error("Invalid minutes value");
  return Math.trunc(n);
}

export async function upsertSlaPolicyAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const severity = String(formData.get("severity") ?? "") as SlaMvpSeverity;
    const clientIdRaw = String(formData.get("clientId") ?? "").trim();
    const enabled = formData.get("enabled") === "on" || formData.get("enabled") === "true";
    const approachingThresholdPct = Number(
      formData.get("approachingThresholdPct") ?? 80
    );

    await upsertSlaPolicy({
      session,
      data: {
        clientId: clientIdRaw === "" || clientIdRaw === "ORG" ? null : clientIdRaw,
        severity,
        mttaMinutes: parseMinutes(formData.get("mttaMinutes")),
        mttcMinutes: parseMinutes(formData.get("mttcMinutes")),
        mttrMinutes: parseMinutes(formData.get("mttrMinutes")),
        approachingThresholdPct,
        enabled,
      },
    });
    revalidatePath("/settings");
    revalidatePath("/attention");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to save SLA policy",
    };
  }
}

export async function setSlaPolicyEnabledAction(input: {
  policyId: string;
  enabled: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");
    await setSlaPolicyEnabled({
      session,
      policyId: input.policyId,
      enabled: input.enabled,
    });
    revalidatePath("/settings");
    revalidatePath("/attention");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to update SLA policy",
    };
  }
}

export async function listSlaPoliciesAction(): Promise<
  Awaited<ReturnType<typeof listSlaPolicies>>
> {
  const session = await requireSession();
  return listSlaPolicies(session.organizationId);
}
