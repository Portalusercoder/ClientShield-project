import type {
  AssetAuthorizationStatus,
  AssetCriticality,
  AssetEnvironment,
  AssetMonitoringStatus,
  AssetType,
} from "@prisma/client";

export interface AssetListItem {
  id: string;
  name: string;
  type: AssetType;
  url: string | null;
  hostname: string | null;
  location: string;
  environment: AssetEnvironment;
  criticality: AssetCriticality;
  monitoringStatus: AssetMonitoringStatus;
  authorizationStatus: AssetAuthorizationStatus;
  securityScore: number | null;
  lastSecurityCheckAt: Date | null;
  clientId: string;
  clientName: string;
  createdAt: Date;
}

export interface AssetDetail extends AssetListItem {
  description: string | null;
  organizationId: string;
  updatedAt: Date;
}

export interface AssetFilters {
  search?: string;
  clientId?: string | "ALL";
  type?: AssetType | "ALL";
  criticality?: AssetCriticality | "ALL";
  monitoringStatus?: AssetMonitoringStatus | "ALL";
  page?: number;
  pageSize?: number;
}

export interface AssetClientOption {
  id: string;
  name: string;
}

export interface AssetListResult {
  assets: AssetListItem[];
  total: number;
  page: number;
  pageSize: number;
  clients: AssetClientOption[];
}

export type AssetActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
