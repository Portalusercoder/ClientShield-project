import type { NavItem } from "@/types/dashboard";

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", icon: "layout-dashboard" },
  { label: "Clients", href: "/clients", icon: "users" },
  { label: "Assets", href: "/assets", icon: "globe" },
  { label: "Vulnerabilities", href: "/vulnerabilities", icon: "shield-alert" },
  { label: "Remediation", href: "/remediation", icon: "wrench" },
  { label: "Incidents", href: "/incidents", icon: "alert-triangle" },
  { label: "Security Events", href: "/security-events", icon: "activity" },
  { label: "IoT Devices", href: "/iot-devices", icon: "cpu" },
  { label: "Reports", href: "/reports", icon: "file-text" },
  { label: "Settings", href: "/settings", icon: "settings" },
];
