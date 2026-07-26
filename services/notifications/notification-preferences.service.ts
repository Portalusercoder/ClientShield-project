/**
 * Notification preference model (Phase 6b5).
 * Stores channel preferences; only IN_APP is consulted for production today.
 * EMAIL / SLACK / WEBHOOK are future-ready — no delivery.
 */
import type { NotificationChannel, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db";

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  "IN_APP",
  "EMAIL",
  "SLACK",
  "WEBHOOK",
];

/** Preference-managed event types (excludes SLA ledger noise by default UI list). */
export const PREFERENCE_EVENT_TYPES: NotificationType[] = [
  "INCIDENT_CREATED_CRITICAL",
  "INCIDENT_ASSIGNED",
  "INCIDENT_RESOLVED",
  "FINDING_ASSIGNED",
  "FINDING_CREATED",
  "INVESTIGATION_CONFIRMED",
  "INVESTIGATION_ASSIGNED",
  "INVESTIGATION_REOPENED",
  "CLAIM_TRANSFERRED",
];

export function defaultChannelEnabled(channel: NotificationChannel): boolean {
  return channel === "IN_APP";
}

export type NotificationPreferenceRow = {
  eventType: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
};

/**
 * Effective IN_APP recipients: missing preference row → enabled.
 */
export async function filterInAppRecipients(input: {
  organizationId: string;
  eventType: NotificationType;
  userIds: string[];
}): Promise<string[]> {
  const unique = [...new Set(input.userIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const prefs = await prisma.notificationPreference.findMany({
    where: {
      organizationId: input.organizationId,
      userId: { in: unique },
      eventType: input.eventType,
      channel: "IN_APP",
    },
    select: { userId: true, enabled: true },
  });
  const byUser = new Map(prefs.map((p) => [p.userId, p.enabled]));
  return unique.filter((id) => byUser.get(id) !== false);
}

export async function listUserNotificationPreferences(input: {
  organizationId: string;
  userId: string;
}): Promise<NotificationPreferenceRow[]> {
  const rows = await prisma.notificationPreference.findMany({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
    },
    select: { eventType: true, channel: true, enabled: true },
  });
  const map = new Map<string, boolean>(
    rows.map((r) => [`${r.eventType}:${r.channel}`, r.enabled])
  );

  const result: NotificationPreferenceRow[] = [];
  for (const eventType of PREFERENCE_EVENT_TYPES) {
    for (const channel of NOTIFICATION_CHANNELS) {
      const key = `${eventType}:${channel}`;
      result.push({
        eventType,
        channel,
        enabled: map.has(key)
          ? Boolean(map.get(key))
          : defaultChannelEnabled(channel),
      });
    }
  }
  return result;
}

export async function upsertNotificationPreference(input: {
  organizationId: string;
  userId: string;
  eventType: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
}): Promise<void> {
  const user = await prisma.user.findFirst({
    where: {
      id: input.userId,
      organizationId: input.organizationId,
      disabledAt: null,
    },
    select: { id: true },
  });
  if (!user) throw new Error("User not found in organization");

  await prisma.notificationPreference.upsert({
    where: {
      organizationId_userId_eventType_channel: {
        organizationId: input.organizationId,
        userId: input.userId,
        eventType: input.eventType,
        channel: input.channel,
      },
    },
    create: {
      organizationId: input.organizationId,
      userId: input.userId,
      eventType: input.eventType,
      channel: input.channel,
      enabled: input.enabled,
    },
    update: { enabled: input.enabled },
  });
}
