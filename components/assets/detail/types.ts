import type { AssetClientOption, AssetDetail } from "@/types/asset";
import type {
  PostureStatus,
  SecurityCheckListItem,
} from "@/types/security-check";
import type { ZapScanListItem } from "@/types/zap";
import type { AssetPostureScoreResult } from "@/types/scoring";
import type {
  EndpointWazuhReadiness,
  WazuhAgentEnrollmentRecord,
} from "@/types/wazuh-enrollment";

export type Tab =
  | "overview"
  | "security-checks"
  | "findings"
  | "incidents"
  | "security-events"
  | "enrollment"
  | "activity";

export const ENDPOINT_TYPES = new Set(["WORKSTATION", "SERVER"]);

export interface AssetFindingItem {
  id: string;
  title: string;
  severity: string;
  status: string;
  source?: string;
  code: string | null;
  instanceCount?: number;
  firstDetectedAt?: Date;
  lastDetectedAt?: Date;
  /** @deprecated use firstDetectedAt */
  createdAt?: Date;
}

export interface AssetIncidentItem {
  id: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  status:
    | "OPEN"
    | "ACKNOWLEDGED"
    | "INVESTIGATING"
    | "CONTAINED"
    | "ERADICATED"
    | "RECOVERING"
    | "RESOLVED"
    | "CLOSED";
  detectedAt: Date;
  assignedToName: string | null;
}

export interface AssetSecurityEventItem {
  id: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  status: string;
  agentName: string | null;
  occurrenceCount: number;
  lastSeenAt: Date;
  ruleId: string | null;
}

export interface AssetDetailViewProps {
  asset: AssetDetail;
  clients: AssetClientOption[];
  canEdit: boolean;
  canArchive: boolean;
  canRunCheck: boolean;
  securityChecks: SecurityCheckListItem[];
  zapScans: ZapScanListItem[];
  findings: AssetFindingItem[];
  incidents: AssetIncidentItem[];
  securityEvents: AssetSecurityEventItem[];
  posture: {
    https: PostureStatus;
    tls: PostureStatus;
    headers: PostureStatus;
    cookies: PostureStatus;
  } | null;
  findingsPosture: AssetPostureScoreResult;
  passiveCheckScore?: number | null;
  enrollments?: WazuhAgentEnrollmentRecord[];
  endpointReadiness?: EndpointWazuhReadiness | null;
  canManageEnrollment?: boolean;
}
