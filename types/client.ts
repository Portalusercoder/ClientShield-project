import type { ClientStatus } from "@prisma/client";

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
  createdAt: Date;
}

export interface ClientDetail extends ClientListItem {
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  phone: string | null;
  updatedAt: Date;
}

export interface ClientFilters {
  search?: string;
  status?: ClientStatus | "ALL";
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

export type ClientActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
