import type {
  WazuhEnrollmentArch,
  WazuhEnrollmentPlatform,
  WazuhEnrollmentStatus,
} from "@prisma/client";

export type EndpointEnrollmentDisplayStatus =
  | "NOT_CONFIGURED"
  | "PENDING_ENROLLMENT"
  | "ENROLLED"
  | "CONNECTED"
  | "DISCONNECTED"
  | "MAPPING_REQUIRED"
  | "ERROR";

export interface WazuhAgentEnrollmentRecord {
  id: string;
  organizationId: string;
  clientId: string;
  assetId: string;
  agentName: string;
  expectedHostname: string;
  platform: WazuhEnrollmentPlatform;
  architecture: WazuhEnrollmentArch;
  status: WazuhEnrollmentStatus;
  connectionHint: string | null;
  requestedAt: Date;
  expiresAt: Date;
  enrolledAt: Date | null;
  verifiedAt: Date | null;
  revokedAt: Date | null;
  wazuhAgentId: string | null;
  mappingId: string | null;
  createdByUserId: string | null;
  lastErrorSanitized: string | null;
  hostnameMismatch: boolean;
  observedHostname: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnrollmentInstructions {
  platform: WazuhEnrollmentPlatform;
  architecture: WazuhEnrollmentArch;
  title: string;
  warning: string;
  steps: string[];
  /** Commands use placeholders only — never real secrets. */
  commands: string[];
  notes: string[];
  secretHandlingTodo: string;
}

export interface EnrollmentVerificationResult {
  enrollment: WazuhAgentEnrollmentRecord;
  matchedAgentId: string | null;
  matchedAgentName: string | null;
  matchedAgentStatus: string | null;
  hostnameMismatch: boolean;
  observedHostname: string | null;
  message: string;
}

export interface EndpointWazuhReadiness {
  displayStatus: EndpointEnrollmentDisplayStatus;
  enrollmentStatus: WazuhEnrollmentStatus | null;
  mappedAgentId: string | null;
  agentLiveStatus: string | null;
  authorized: boolean;
  message: string;
}

/** Default enrollment validity window. */
export const WAZUH_ENROLLMENT_EXPIRY_HOURS = 72;

export const ENDPOINT_ENROLLMENT_ASSET_TYPES = [
  "WORKSTATION",
  "SERVER",
] as const;
