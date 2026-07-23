"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchUnreadNotificationCountAction } from "@/app/(dashboard)/notifications/actions";

export function NotificationBell() {
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const count = await fetchUnreadNotificationCountAction();
        if (!cancelled) setUnread(count);
      } catch {
        if (!cancelled) setUnread(0);
      }
    }
    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const badge = unread != null && unread > 0 ? unread : null;

  return (
    <Link
      href="/notifications"
      className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-muted hover:text-foreground"
      aria-label={
        badge != null
          ? `Notifications, ${badge} unread`
          : "Notifications"
      }
    >
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
        />
      </svg>
      {badge != null && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
