"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { upsertNotificationPreference } from "@/services/notifications/notification-preferences.service";

const schema = z.object({
  eventType: z.enum([
    "INCIDENT_CREATED_CRITICAL",
    "INCIDENT_ASSIGNED",
    "INCIDENT_RESOLVED",
    "FINDING_ASSIGNED",
    "FINDING_CREATED",
    "INVESTIGATION_CONFIRMED",
    "INVESTIGATION_ASSIGNED",
    "INVESTIGATION_REOPENED",
    "CLAIM_TRANSFERRED",
    "SLA_MTTA_HALF",
    "SLA_MTTA_APPROACHING",
    "SLA_MTTA_BREACHED",
    "SLA_MTTC_APPROACHING",
    "SLA_MTTC_BREACHED",
    "SLA_MTTR_APPROACHING",
    "SLA_MTTR_BREACHED",
  ]),
  channel: z.enum(["IN_APP", "EMAIL", "SLACK", "WEBHOOK"]),
  enabled: z.boolean(),
});

export async function upsertNotificationPreferenceAction(input: {
  eventType: string;
  channel: string;
  enabled: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSession();
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }
    await upsertNotificationPreference({
      organizationId: session.organizationId,
      userId: session.userId,
      eventType: parsed.data.eventType,
      channel: parsed.data.channel,
      enabled: parsed.data.enabled,
    });
    revalidatePath("/settings");
    revalidatePath("/notifications");
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to save preference",
    };
  }
}
