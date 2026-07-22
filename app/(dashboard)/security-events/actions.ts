"use server";

import { revalidatePath } from "next/cache";
import { assertMinimumRole, requireSession } from "@/lib/auth";
import {
  dismissSecurityEventSchema,
  escalateSecurityEventSchema,
  linkSecurityEventToIncidentSchema,
  wazuhAgentMappingSchema,
  wazuhSyncSchema,
} from "@/lib/validations/security-events";
import {
  acknowledgeSecurityEvent,
  dismissSecurityEvent,
  escalateSecurityEventToIncident,
  linkSecurityEventToIncident,
  startSecurityEventReview,
  unlinkSecurityEventFromIncident,
} from "@/services/security-events.service";
import {
  removeWazuhAgentMapping,
  upsertWazuhAgentMapping,
} from "@/services/wazuh/wazuh-agent.service";
import {
  initializeWazuhIngestionFromNow,
  syncWazuhNewEventsFromCheckpoint,
  syncWazuhSecurityEvents,
} from "@/services/wazuh/wazuh-ingestion.service";

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof Error) return { success: false, error: error.message };
  return { success: false, error: "An unexpected error occurred" };
}

function revalidateSecurityEventPaths(
  eventId: string,
  extra?: { clientId?: string | null; assetId?: string | null; incidentId?: string }
) {
  revalidatePath("/security-events");
  revalidatePath(`/security-events/${eventId}`);
  revalidatePath("/");
  revalidatePath("/integrations/wazuh");
  if (extra?.clientId) revalidatePath(`/clients/${extra.clientId}`);
  if (extra?.assetId) revalidatePath(`/assets/${extra.assetId}`);
  if (extra?.incidentId) revalidatePath(`/incidents/${extra.incidentId}`);
}

export async function startSecurityEventReviewAction(
  eventId: string
): Promise<ActionResult<void>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");
    await startSecurityEventReview({
      organizationId: session.organizationId,
      actorId: session.userId,
      eventId,
    });
    revalidateSecurityEventPaths(eventId);
    return { success: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function acknowledgeSecurityEventAction(
  eventId: string
): Promise<ActionResult<void>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");
    await acknowledgeSecurityEvent({
      organizationId: session.organizationId,
      actorId: session.userId,
      eventId,
    });
    revalidateSecurityEventPaths(eventId);
    return { success: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function dismissSecurityEventAction(
  eventId: string,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");
    const parsed = dismissSecurityEventSchema.safeParse({
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }
    await dismissSecurityEvent({
      organizationId: session.organizationId,
      actorId: session.userId,
      eventId,
      data: parsed.data,
    });
    revalidateSecurityEventPaths(eventId);
    return { success: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function escalateSecurityEventAction(
  eventId: string,
  formData: FormData
): Promise<ActionResult<{ incidentId: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const emptyToNull = (v: FormDataEntryValue | null) => {
      if (v == null || v === "") return undefined;
      return String(v);
    };

    const parsed = escalateSecurityEventSchema.safeParse({
      title: emptyToNull(formData.get("title")),
      description: emptyToNull(formData.get("description")),
      severity: emptyToNull(formData.get("severity")),
      category: emptyToNull(formData.get("category")),
      assetId: emptyToNull(formData.get("assetId")),
      assignedToUserId: emptyToNull(formData.get("assignedToUserId")),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const result = await escalateSecurityEventToIncident({
      organizationId: session.organizationId,
      actorId: session.userId,
      eventId,
      data: parsed.data,
    });
    revalidateSecurityEventPaths(eventId, { incidentId: result.incidentId });
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function linkSecurityEventToIncidentAction(
  input: { securityEventId: string; incidentId: string }
): Promise<ActionResult<{ incidentId: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");
    const parsed = linkSecurityEventToIncidentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }
    await linkSecurityEventToIncident({
      organizationId: session.organizationId,
      actorId: session.userId,
      data: parsed.data,
    });
    revalidateSecurityEventPaths(parsed.data.securityEventId, {
      incidentId: parsed.data.incidentId,
    });
    return { success: true, data: { incidentId: parsed.data.incidentId } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function unlinkSecurityEventFromIncidentAction(input: {
  incidentId: string;
  securityEventId: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");
    await unlinkSecurityEventFromIncident({
      organizationId: session.organizationId,
      actorId: session.userId,
      incidentId: input.incidentId,
      securityEventId: input.securityEventId,
    });
    revalidateSecurityEventPaths(input.securityEventId, {
      incidentId: input.incidentId,
    });
    return { success: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function initializeWazuhFromNowAction(): Promise<
  ActionResult<{
    checkpointTimestamp: string;
    basedOnNewestAlert: boolean;
  }>
> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");
    const result = await initializeWazuhIngestionFromNow({
      organizationId: session.organizationId,
      actorId: session.userId,
    });
    revalidatePath("/integrations/wazuh");
    revalidatePath("/security-events");
    revalidatePath("/");
    return {
      success: true,
      data: {
        checkpointTimestamp: result.checkpointTimestamp.toISOString(),
        basedOnNewestAlert: result.basedOnNewestAlert,
      },
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function syncWazuhNewEventsAction(): Promise<
  ActionResult<{
    processed: number;
    created: number;
    updated: number;
    filtered: number;
    ignored: number;
    skippedDuplicates: number;
  }>
> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");
    const result = await syncWazuhNewEventsFromCheckpoint({
      organizationId: session.organizationId,
      actorId: session.userId,
    });
    revalidatePath("/security-events");
    revalidatePath("/integrations/wazuh");
    revalidatePath("/");
    return {
      success: true,
      data: {
        processed: result.processed,
        created: result.created,
        updated: result.updated,
        filtered: result.filtered,
        ignored: result.ignored,
        skippedDuplicates: result.skippedDuplicates,
      },
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function syncWazuhEventsAction(input: {
  mode: "FROM_NOW" | "LAST_1H" | "LAST_24H";
  continueFromCheckpoint?: boolean;
}): Promise<
  ActionResult<{
    processed: number;
    created: number;
    updated: number;
    filtered: number;
    ignored: number;
    skippedDuplicates: number;
  }>
> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");
    const parsed = wazuhSyncSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }
    const result = await syncWazuhSecurityEvents({
      organizationId: session.organizationId,
      actorId: session.userId,
      mode: parsed.data.mode,
      continueFromCheckpoint: parsed.data.continueFromCheckpoint,
    });
    revalidatePath("/security-events");
    revalidatePath("/integrations/wazuh");
    revalidatePath("/");
    return {
      success: true,
      data: {
        processed: result.processed,
        created: result.created,
        updated: result.updated,
        filtered: result.filtered,
        ignored: result.ignored,
        skippedDuplicates: result.skippedDuplicates,
      },
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function upsertWazuhAgentMappingAction(
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");
    const parsed = wazuhAgentMappingSchema.safeParse({
      wazuhAgentId: formData.get("wazuhAgentId"),
      wazuhAgentName: formData.get("wazuhAgentName") || undefined,
      clientId: formData.get("clientId"),
      assetId: formData.get("assetId"),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }
    await upsertWazuhAgentMapping({
      organizationId: session.organizationId,
      actorId: session.userId,
      ...parsed.data,
    });
    revalidatePath("/integrations/wazuh");
    return { success: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeWazuhAgentMappingAction(
  wazuhAgentId: string
): Promise<ActionResult<void>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");
    await removeWazuhAgentMapping({
      organizationId: session.organizationId,
      actorId: session.userId,
      wazuhAgentId,
    });
    revalidatePath("/integrations/wazuh");
    return { success: true };
  } catch (error) {
    return toActionError(error);
  }
}
