/**
 * In-app notification types (Phases 4a–4c).
 */
import type {
  NotificationSeverity,
  NotificationSourceType,
  NotificationType,
} from "@prisma/client";

export type NotificationInboxFilter =
  | "ALL"
  | "UNREAD"
  | "CRITICAL"
  | "SLA"
  | "ASSIGNMENTS";

export interface CreateNotificationInput {
  organizationId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  sourceType: NotificationSourceType;
  sourceId: string;
  dedupeKey: string;
  /** Recipient user IDs — must belong to organizationId. Deduped before insert. */
  recipientUserIds: string[];
  /** Cached display only — validated against source when provided. */
  clientId?: string | null;
  /** Cached display only — validated against source when provided. */
  assetId?: string | null;
  /** Internal path only, e.g. /incidents/{id}. */
  href?: string | null;
  expiresAt?: Date | null;
}

export interface NotificationInboxItem {
  recipientId: string;
  notificationId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  sourceType: NotificationSourceType;
  sourceId: string;
  clientId: string | null;
  assetId: string | null;
  href: string | null;
  createdAt: Date;
  readAt: Date | null;
  dismissedAt: Date | null;
}

export interface ListInboxResult {
  items: NotificationInboxItem[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
}

export const SLA_NOTIFICATION_TYPES: NotificationType[] = [
  "SLA_MTTA_HALF",
  "SLA_MTTA_APPROACHING",
  "SLA_MTTA_BREACHED",
  "SLA_MTTC_APPROACHING",
  "SLA_MTTC_BREACHED",
  "SLA_MTTR_APPROACHING",
  "SLA_MTTR_BREACHED",
];

export const ASSIGNMENT_NOTIFICATION_TYPES: NotificationType[] = [
  "INCIDENT_ASSIGNED",
  "FINDING_ASSIGNED",
];
