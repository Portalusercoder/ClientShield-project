import type { Metadata } from "next";
import { NotificationsPageClient } from "@/components/notifications/notifications-page-client";
import { requireSession } from "@/lib/auth";
import { listNotificationInbox } from "@/services/notifications/notification.service";
import type { NotificationInboxFilter } from "@/types/notifications";

export const metadata: Metadata = {
  title: "Notifications",
};

export const dynamic = "force-dynamic";

interface NotificationsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const FILTERS = new Set<NotificationInboxFilter>([
  "ALL",
  "UNREAD",
  "CRITICAL",
  "SLA",
  "ASSIGNMENTS",
]);

export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const raw = params.filter;
  const filter =
    typeof raw === "string" && FILTERS.has(raw as NotificationInboxFilter)
      ? (raw as NotificationInboxFilter)
      : "ALL";

  const inbox = await listNotificationInbox({
    organizationId: session.organizationId,
    userId: session.userId,
    filter,
  });

  return (
    <NotificationsPageClient
      items={inbox.items}
      filter={filter}
      unreadCount={inbox.unreadCount}
      total={inbox.total}
    />
  );
}
