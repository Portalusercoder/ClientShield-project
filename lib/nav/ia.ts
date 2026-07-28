import type { UserRole } from "@prisma/client";

export type NavItem = {
  label: string;
  href: string;
  icon: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export type NavPersona = "analyst" | "manager" | "executive";

export function personaForRole(role: UserRole | null | undefined): NavPersona {
  if (role === "VIEWER") return "executive";
  if (role === "ADMIN" || role === "OWNER") return "manager";
  return "analyst";
}

/** Default landing path after auth for each role. */
export function defaultHomeForRole(role: UserRole | null | undefined): string {
  const persona = personaForRole(role);
  if (persona === "executive") return "/executive";
  if (persona === "manager") return "/attention";
  return "/";
}

const DETECT_RESPOND: NavGroup = {
  label: "Detect & respond",
  items: [
    { label: "Security Events", href: "/security-events", icon: "pulse" },
    { label: "Investigations", href: "/investigations", icon: "search" },
    { label: "Incidents", href: "/incidents", icon: "alert" },
  ],
};

const ANALYST_NAV: NavGroup[] = [
  {
    label: "Work",
    items: [
      { label: "Shift overview", href: "/", icon: "grid" },
      { label: "Work queue", href: "/attention", icon: "flag" },
    ],
  },
  DETECT_RESPOND,
  {
    label: "Posture",
    items: [{ label: "Findings", href: "/vulnerabilities", icon: "shield" }],
  },
  {
    label: "Estate",
    items: [
      { label: "Clients", href: "/clients", icon: "users" },
      { label: "Assets", href: "/assets", icon: "server" },
    ],
  },
];

const MANAGER_NAV: NavGroup[] = [
  {
    label: "Work",
    items: [{ label: "Work queue", href: "/attention", icon: "flag" }],
  },
  DETECT_RESPOND,
  {
    label: "Posture",
    items: [
      { label: "Findings", href: "/vulnerabilities", icon: "shield" },
      { label: "Security Posture", href: "/executive", icon: "gauge" },
    ],
  },
  {
    label: "Insights",
    items: [{ label: "Reports", href: "/reports", icon: "file" }],
  },
  {
    label: "Estate",
    items: [
      { label: "Clients", href: "/clients", icon: "users" },
      { label: "Assets", href: "/assets", icon: "server" },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Settings", href: "/settings", icon: "settings" },
      { label: "Wazuh", href: "/integrations/wazuh", icon: "plug" },
    ],
  },
];

const EXECUTIVE_NAV: NavGroup[] = [
  {
    label: "Insights",
    items: [
      { label: "Security Posture", href: "/executive", icon: "gauge" },
      { label: "Reports", href: "/reports", icon: "file" },
    ],
  },
  {
    label: "Estate",
    items: [
      { label: "Clients", href: "/clients", icon: "users" },
      { label: "Assets", href: "/assets", icon: "server" },
    ],
  },
];

export function navGroupsForRole(
  role: UserRole | null | undefined
): NavGroup[] {
  const persona = personaForRole(role);
  if (persona === "executive") return EXECUTIVE_NAV;
  if (persona === "manager") return MANAGER_NAV;
  return ANALYST_NAV;
}

/**
 * Whether a nav href should show as active for the current pathname.
 * Findings covers remediation deep-links; Posture covers analytics deep-links.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  if (href === "/vulnerabilities") {
    return (
      pathname === "/vulnerabilities" ||
      pathname.startsWith("/vulnerabilities/") ||
      pathname === "/remediation" ||
      pathname.startsWith("/remediation/")
    );
  }
  if (href === "/executive") {
    return (
      pathname === "/executive" ||
      pathname.startsWith("/executive/") ||
      pathname === "/analytics" ||
      pathname.startsWith("/analytics/")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const PAGE_TITLES: Record<string, string> = {
  "/": "Shift overview",
  "/executive": "Security Posture",
  "/analytics": "Security Posture",
  "/clients": "Clients",
  "/assets": "Assets",
  "/vulnerabilities": "Findings",
  "/remediation": "Findings",
  "/incidents": "Incidents",
  "/security-events": "Security Events",
  "/integrations/wazuh": "Wazuh Integration",
  "/iot-devices": "IoT Devices",
  "/reports": "Reports",
  "/settings": "Settings",
  "/settings/users": "Organization Users",
  "/investigations": "Investigations",
  "/investigations/candidates": "Investigation Candidates",
  "/attention": "Work queue",
  "/notifications": "Notifications",
};
