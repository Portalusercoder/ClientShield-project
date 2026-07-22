import type {
  ClientOnboardingStatus,
  ClientStatus,
} from "@prisma/client";
import type {
  ClientReadinessSummary,
  ReadinessOverall,
} from "@/types/client-onboarding";

export interface ClientListItem {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  website: string | null;
  status: ClientStatus;
  securityScore: number | null;
  assetsCount: number;
  openFindingsCount: number;
  openIncidentsCount: number;
  servicesCount: number;
  openInvestigationsCount: number;
  onboardingStatus: ClientOnboardingStatus | null;
  readinessSummary: ClientReadinessSummary | null;
  createdAt: Date;
}

export interface ClientDetail extends ClientListItem {
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  phone: string | null;
  country: string | null;
  timezone: string | null;
  notes: string | null;
  onboardingStartedAt: Date | null;
  activatedAt: Date | null;
  suspendedAt: Date | null;
  offboardedAt: Date | null;
  updatedAt: Date;
}

export interface ClientFilters {
  search?: string;
  status?: ClientStatus | "ALL";
  onboardingStatus?: ClientOnboardingStatus | "ALL";
  readiness?: ReadinessOverall | "ALL";
  industry?: string | "ALL";
  page?: number;
  pageSize?: number;
}

export interface ClientListResult {
  clients: ClientListItem[];
  total: number;
  page: number;
  pageSize: number;
  industries: string[];
}

export interface ClientManagementMetrics {
  activeClients: number;
  clientsOnboarding: number;
  clientsNotReady: number;
  clientsWithCriticalFindings: number;
  clientsWithOpenIncidents: number;
}

export type ClientActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
