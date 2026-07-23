import type {
  ClientContactType,
  ClientOnboardingStatus,
  ClientOnboardingStep,
  ClientServiceStatus,
  ClientServiceType,
  ClientStatus,
} from "@prisma/client";

export interface ClientContactRecord {
  id: string;
  organizationId: string;
  clientId: string;
  name: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  contactType: ClientContactType;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientServiceRecord {
  id: string;
  organizationId: string;
  clientId: string;
  serviceType: ClientServiceType;
  status: ClientServiceStatus;
  enabledAt: Date | null;
  disabledAt: Date | null;
  configuration: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientOnboardingRecord {
  id: string;
  organizationId: string;
  clientId: string;
  status: ClientOnboardingStatus;
  currentStep: ClientOnboardingStep;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ReadinessOverall = "READY" | "NOT_READY" | "BLOCKED";

export type ReadinessCheckKey =
  | "profile"
  | "contacts"
  | "assets"
  | "services"
  | "authorization"
  | "wazuh_assets"
  | "website_assets";

export interface ReadinessCheck {
  key: ReadinessCheckKey;
  label: string;
  passed: boolean;
  /** Hard stop that prevents activation (e.g. explicit NOT_AUTHORIZED). */
  blocked?: boolean;
  message: string;
}

export interface ClientReadinessResult {
  overall: ReadinessOverall;
  checks: ReadinessCheck[];
  blockers: string[];
}

export type WazuhReadinessStatus =
  | "CONNECTED"
  | "SETUP_REQUIRED"
  | "NOT_APPLICABLE"
  | "NOT_CONFIGURED"
  | "PENDING_ENROLLMENT"
  | "ENROLLED"
  | "DISCONNECTED"
  | "MAPPING_REQUIRED"
  | "ERROR";

export interface WazuhReadinessResult {
  status: WazuhReadinessStatus;
  endpointAssetCount: number;
  mappedAgentCount: number;
  authorizedEndpointCount?: number;
  pendingEnrollmentCount?: number;
  message: string;
}

export interface ClientActivityItem {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorId: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface ClientActivityResult {
  items: ClientActivityItem[];
  total: number;
}

export interface OrganizationSettingsRecord {
  id: string;
  organizationId: string;
  displayName: string | null;
  defaultTimezone: string | null;
  securityContactEmail: string | null;
  defaultReportBranding: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationUserListItem {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

/** Lightweight readiness for list views. */
export interface ClientReadinessSummary {
  overall: ReadinessOverall;
}

export interface ClientListOnboardingFields {
  onboardingStatus: ClientOnboardingStatus | null;
  readinessSummary: ClientReadinessSummary | null;
  servicesCount: number;
  openInvestigationsCount: number;
}

export const CLIENT_LIFECYCLE_TRANSITIONS: Record<
  ClientStatus,
  ClientStatus[]
> = {
  PROSPECT: ["ONBOARDING"],
  ONBOARDING: ["ACTIVE", "OFFBOARDED"],
  ACTIVE: ["SUSPENDED", "OFFBOARDED"],
  SUSPENDED: ["ACTIVE", "OFFBOARDED"],
  OFFBOARDED: ["ACTIVE"],
  INACTIVE: ["ACTIVE"],
};

export const SERVICE_CATALOG: ClientServiceType[] = [
  "PASSIVE_WEB_MONITORING",
  "ZAP_BASELINE",
  "WAZUH_ENDPOINT_MONITORING",
  "SECURITY_EVENT_MONITORING",
  "INCIDENT_RESPONSE",
  "REPORTING",
];

export const ONBOARDING_STEPS: ClientOnboardingStep[] = [
  "CLIENT_PROFILE",
  "CONTACTS",
  "SECURITY_SCOPE",
  "ASSETS",
  "SERVICES",
  "AUTHORIZATION",
  "REVIEW",
];
