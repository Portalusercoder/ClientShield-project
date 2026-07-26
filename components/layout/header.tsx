"use client";

import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/(auth)/actions";
import { NotificationBell } from "@/components/notifications/notification-bell";

const PAGE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/executive": "Executive",
  "/analytics": "Analytics",
  "/clients": "Clients",
  "/assets": "Assets",
  "/vulnerabilities": "Findings",
  "/remediation": "Remediation",
  "/incidents": "Incidents",
  "/security-events": "Security Events",
  "/integrations/wazuh": "Wazuh Integration",
  "/iot-devices": "IoT Devices",
  "/reports": "Reports",
  "/settings": "Settings",
  "/settings/users": "Organization Users",
  "/investigations": "Investigations",
  "/attention": "Attention",
  "/notifications": "Notifications",
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];

  const match = Object.entries(PAGE_TITLES).find(
    ([path]) => path !== "/" && pathname.startsWith(path)
  );

  return match?.[1] ?? "ClientShield";
}

function initials(name: string | null, email: string | null): string {
  const source = (name ?? email ?? "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

interface HeaderProps {
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
}

export function Header({
  userName = null,
  userEmail = null,
  userRole = null,
}: HeaderProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const displayName = userName ?? userEmail ?? "Signed out";
  const displayMeta = [userRole, userEmail].filter(Boolean).join(" · ");

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm md:px-6 lg:px-8">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted">
          Cybersecurity monitoring &amp; vulnerability management
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 sm:flex">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
          <span className="text-xs text-muted">System operational</span>
        </div>

        <NotificationBell />

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-foreground">{displayName}</p>
            <p className="text-xs text-muted">{displayMeta || "—"}</p>
          </div>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-sm font-medium text-accent"
            aria-label="User avatar"
          >
            {initials(userName, userEmail)}
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-xs text-muted hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
