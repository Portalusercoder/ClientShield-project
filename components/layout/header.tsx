"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/(auth)/actions";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";

const PAGE_TITLES: Record<string, string> = {
  "/": "SOC Home",
  "/executive": "Security Posture",
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
  "/investigations/candidates": "Investigation Candidates",
  "/attention": "Attention",
  "/notifications": "Notifications",
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const match = Object.entries(PAGE_TITLES)
    .filter(([path]) => path !== "/")
    .sort((a, b) => b[0].length - a[0].length)
    .find(([path]) => pathname.startsWith(path));
  return match?.[1] ?? "ClientShield";
}

function buildBreadcrumbs(
  pathname: string
): Array<{ label: string; href?: string }> {
  if (pathname === "/") return [{ label: "SOC Home" }];
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: Array<{ label: string; href?: string }> = [
    { label: "SOC Home", href: "/" },
  ];
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    acc += `/${parts[i]}`;
    const isLast = i === parts.length - 1;
    const title =
      PAGE_TITLES[acc] ??
      (parts[i]!.length > 18 ? `${parts[i]!.slice(0, 8)}…` : parts[i]!);
    crumbs.push({
      label: title,
      href: isLast ? undefined : acc,
    });
  }
  return crumbs;
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

/**
 * Chrome-only header: breadcrumbs + utilities.
 * Page H1 lives in PageHeader on each screen — avoid competing titles.
 */
export function Header({
  userName = null,
  userEmail = null,
  userRole = null,
}: HeaderProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const crumbs = buildBreadcrumbs(pathname);
  const { setMobileOpen } = useShell();
  const displayName = userName ?? userEmail ?? "Signed out";

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6 lg:px-8">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] text-muted hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
          aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}
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
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <nav aria-label="Breadcrumb" className="hidden sm:block">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              {crumbs.map((crumb, i) => (
                <li
                  key={`${crumb.label}-${i}`}
                  className="flex items-center gap-1.5"
                >
                  {i > 0 && <span aria-hidden="true">/</span>}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">
                      {crumb.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          {/* Mobile: compact title only — desktop uses breadcrumbs; H1 is in page */}
          <p className="truncate text-sm font-semibold tracking-tight text-foreground sm:hidden">
            {title}
          </p>
        </div>

        <div className="hidden max-w-xs flex-1 md:block lg:max-w-sm">
          <label className="sr-only" htmlFor="global-search">
            Search
          </label>
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              id="global-search"
              type="search"
              placeholder="Search…"
              disabled
              title="Global search coming soon"
              className="h-9 w-full rounded-[6px] border border-border bg-surface-elevated pl-9 pr-3 text-sm text-muted placeholder:text-muted/80"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <NotificationBell />

          <div
            className="hidden h-6 w-px bg-border sm:block"
            aria-hidden="true"
          />

          <div className="flex items-center gap-2">
            <div className="hidden text-right md:block">
              <p className="max-w-[140px] truncate text-sm font-medium text-foreground">
                {displayName}
              </p>
              <p className="text-[11px] text-muted">{userRole ?? "—"}</p>
            </div>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold text-accent"
              aria-hidden="true"
            >
              {initials(userName, userEmail)}
            </div>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
