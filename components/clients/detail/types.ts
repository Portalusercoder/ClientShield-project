import type { AssetListItem } from "@/types/asset";
import type { ClientDetail } from "@/types/client";
import type {
  ClientActivityItem,
  ClientContactRecord,
  ClientOnboardingRecord,
  ClientReadinessResult,
  ClientServiceRecord,
  WazuhReadinessResult,
} from "@/types/client-onboarding";
import { SERVICE_CATALOG } from "@/types/client-onboarding";
import type { FindingListItem } from "@/types/findings";
import type { ClientPostureScoreResult } from "@/types/scoring";

export interface ClientIncidentItem {
  id: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  status: string;
  detectedAt: Date;
  assetId: string | null;
  assetName: string | null;
  assignedToName: string | null;
}

export interface ClientSecurityEventItem {
  id: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  status: string;
  asset: { name: string } | null;
  agentName: string | null;
  occurrenceCount: number;
  lastSeenAt: Date;
}

export interface ClientInvestigationItem {
  id: string;
  title: string;
  status: string;
  createdByType: string;
  confidence: string | null;
  eventCount: number;
  updatedAt: Date;
}

export interface ClientReportItem {
  id: string;
  title: string;
  createdAt: Date;
}

export const SERVICE_LABELS: Record<(typeof SERVICE_CATALOG)[number], string> = {
  PASSIVE_WEB_MONITORING: "Passive Web Monitoring",
  ZAP_BASELINE: "ZAP Baseline",
  WAZUH_ENDPOINT_MONITORING: "Wazuh Endpoint Monitoring",
  SECURITY_EVENT_MONITORING: "Security Event Monitoring",
  INCIDENT_RESPONSE: "Incident Response",
  REPORTING: "Reporting",
};

export type Tab =
  | "overview"
  | "onboarding"
  | "scope"
  | "assets"
  | "services"
  | "contacts"
  | "findings"
  | "security-events"
  | "investigations"
  | "incidents"
  | "reports"
  | "activity";

export const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "onboarding", label: "Onboarding" },
  { id: "scope", label: "Security Scope" },
  { id: "assets", label: "Assets" },
  { id: "services", label: "Services" },
  { id: "contacts", label: "Contacts" },
  { id: "findings", label: "Findings" },
  { id: "security-events", label: "Security Events" },
  { id: "investigations", label: "Investigations" },
  { id: "incidents", label: "Incidents" },
  { id: "reports", label: "Reports" },
  { id: "activity", label: "Activity" },
];

export interface ClientDetailViewProps {
  client: ClientDetail;
  assets: AssetListItem[];
  findings: FindingListItem[];
  incidents: ClientIncidentItem[];
  securityEvents: ClientSecurityEventItem[];
  investigations: ClientInvestigationItem[];
  reports: ClientReportItem[];
  contacts: ClientContactRecord[];
  services: ClientServiceRecord[];
  onboarding: ClientOnboardingRecord | null;
  readiness: ClientReadinessResult | null;
  wazuhReadiness: WazuhReadinessResult | null;
  activity: ClientActivityItem[];
  clientPosture: ClientPostureScoreResult;
  canEdit: boolean;
  canManageClient: boolean;
  canArchive: boolean;
  canCreateAsset: boolean;
}
