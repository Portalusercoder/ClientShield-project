"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markAllNotificationsReadAction } from "@/app/(dashboard)/notifications/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityLink } from "@/components/ui/entity-link";
import { formatRelativeTime } from "@/lib/utils";
import type { NotificationInboxItem } from "@/types/notifications";

export function NotificationsSection({
  unreadCount,
  recent,
}: {
  unreadCount: number;
  recent: NotificationInboxItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function markAllRead() {
    setError(null);
    startTransition(async () => {
      try {
        await markAllNotificationsReadAction();
        router.refresh();
      } catch {
        setError("Unable to mark notifications read.");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            {unreadCount} unread · recent inbox activity
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending || unreadCount === 0}
            onClick={markAllRead}
          >
            Mark all read
          </Button>
          <Link
            href="/notifications"
            className="text-sm font-medium text-accent hover:underline"
          >
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="mb-3 text-sm text-severity-critical">{error}</p>
        ) : null}
        {recent.length === 0 ? (
          <EmptyState
            title="No notifications"
            description="Assignment and SLA alerts will appear here."
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((n) => (
              <li key={n.recipientId} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {n.href ? (
                      <EntityLink href={n.href} className="font-medium">
                        {n.title}
                      </EntityLink>
                    ) : (
                      <p className="font-medium text-foreground">{n.title}</p>
                    )}
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted">
                      {n.message}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted">
                    <p>{formatRelativeTime(n.createdAt)}</p>
                    {!n.readAt ? (
                      <p className="mt-1 font-medium text-accent">Unread</p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
