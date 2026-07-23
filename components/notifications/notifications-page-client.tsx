"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  dismissNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
} from "@/app/(dashboard)/notifications/actions";
import type {
  NotificationInboxFilter,
  NotificationInboxItem,
} from "@/types/notifications";

const FILTERS: { id: NotificationInboxFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "UNREAD", label: "Unread" },
  { id: "CRITICAL", label: "Critical" },
  { id: "SLA", label: "SLA" },
  { id: "ASSIGNMENTS", label: "Assignments" },
];

function severityClass(severity: string): string {
  switch (severity) {
    case "CRITICAL":
      return "text-danger";
    case "HIGH":
      return "text-warning";
    case "WARNING":
      return "text-accent";
    default:
      return "text-muted";
  }
}

interface NotificationsPageClientProps {
  items: NotificationInboxItem[];
  filter: NotificationInboxFilter;
  unreadCount: number;
  total: number;
}

export function NotificationsPageClient({
  items,
  filter,
  unreadCount,
  total,
}: NotificationsPageClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setFilter(next: NotificationInboxFilter) {
    const params = new URLSearchParams();
    if (next !== "ALL") params.set("filter", next);
    router.push(`/notifications${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
          <p className="mt-1 text-sm text-muted">
            {unreadCount} unread · {total} in this view
          </p>
        </div>
        <button
          type="button"
          disabled={pending || unreadCount === 0}
          onClick={() =>
            startTransition(async () => {
              await markAllNotificationsReadAction();
              router.refresh();
            })
          }
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
        >
          Mark all read
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              filter === f.id
                ? "bg-accent/15 text-accent"
                : "border border-border text-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">No notifications in this view.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((item) => (
            <li
              key={item.recipientId}
              className={`py-4 ${item.readAt ? "opacity-80" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {!item.readAt && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                    )}
                    <span className={`text-xs font-medium uppercase ${severityClass(item.severity)}`}>
                      {item.severity}
                    </span>
                    <span className="text-xs text-muted">{item.type.replaceAll("_", " ")}</span>
                  </div>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="block text-sm font-medium text-foreground hover:text-accent"
                      onClick={() => {
                        if (!item.readAt) {
                          startTransition(async () => {
                            await markNotificationReadAction(item.recipientId);
                          });
                        }
                      }}
                    >
                      {item.title}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                  )}
                  <p className="text-sm text-muted">{item.message}</p>
                  <p className="text-xs text-muted">
                    {item.createdAt.toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {item.readAt ? (
                    <button
                      type="button"
                      disabled={pending}
                      className="text-xs text-muted hover:text-foreground"
                      onClick={() =>
                        startTransition(async () => {
                          await markNotificationUnreadAction(item.recipientId);
                          router.refresh();
                        })
                      }
                    >
                      Mark unread
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      className="text-xs text-muted hover:text-foreground"
                      onClick={() =>
                        startTransition(async () => {
                          await markNotificationReadAction(item.recipientId);
                          router.refresh();
                        })
                      }
                    >
                      Mark read
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    className="text-xs text-muted hover:text-foreground"
                    onClick={() =>
                      startTransition(async () => {
                        await dismissNotificationAction(item.recipientId);
                        router.refresh();
                      })
                    }
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
