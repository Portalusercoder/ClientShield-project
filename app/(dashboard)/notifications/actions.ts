"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import {
  dismissNotification,
  getUnreadNotificationCount,
  listNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from "@/services/notifications/notification.service";
import type { NotificationInboxFilter } from "@/types/notifications";

const FILTERS = new Set<NotificationInboxFilter>([
  "ALL",
  "UNREAD",
  "CRITICAL",
  "SLA",
  "ASSIGNMENTS",
]);

function parseFilter(raw: unknown): NotificationInboxFilter {
  if (typeof raw === "string" && FILTERS.has(raw as NotificationInboxFilter)) {
    return raw as NotificationInboxFilter;
  }
  return "ALL";
}

export async function fetchNotificationInboxAction(input?: {
  filter?: string;
  page?: number;
}) {
  const session = await requireSession();
  return listNotificationInbox({
    organizationId: session.organizationId,
    userId: session.userId,
    filter: parseFilter(input?.filter),
    page: input?.page,
  });
}

export async function fetchUnreadNotificationCountAction() {
  const session = await requireSession();
  return getUnreadNotificationCount({
    organizationId: session.organizationId,
    userId: session.userId,
  });
}

export async function markNotificationReadAction(recipientId: string) {
  const session = await requireSession();
  await markNotificationRead({
    organizationId: session.organizationId,
    userId: session.userId,
    recipientId,
  });
  revalidatePath("/notifications");
}

export async function markNotificationUnreadAction(recipientId: string) {
  const session = await requireSession();
  await markNotificationUnread({
    organizationId: session.organizationId,
    userId: session.userId,
    recipientId,
  });
  revalidatePath("/notifications");
}

export async function dismissNotificationAction(recipientId: string) {
  const session = await requireSession();
  await dismissNotification({
    organizationId: session.organizationId,
    userId: session.userId,
    recipientId,
  });
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  const session = await requireSession();
  const count = await markAllNotificationsRead({
    organizationId: session.organizationId,
    userId: session.userId,
  });
  revalidatePath("/notifications");
  return count;
}
