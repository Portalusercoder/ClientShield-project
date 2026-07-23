/**
 * In-app notification foundation (Phase 4a).
 *
 * Isolation: every inbox query/mutation requires
 *   notification.organizationId = session.organizationId
 *   AND recipient.userId = session.userId
 *
 * Read/unread/dismiss do NOT acknowledge Attention/Incident,
 * change SecurityEvent status, resolve SLA, or mutate source entities.
 *
 * Dedupe: @@unique([organizationId, dedupeKey]) is the final boundary.
 */
import {
  Prisma,
  type Notification,
  type NotificationSourceType,
  type PrismaClient,
  type UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  CreateNotificationInput,
  ListInboxResult,
  NotificationInboxFilter,
  NotificationInboxItem,
} from "@/types/notifications";
import {
  ASSIGNMENT_NOTIFICATION_TYPES,
  SLA_NOTIFICATION_TYPES,
} from "@/types/notifications";

type Db = PrismaClient | Prisma.TransactionClient;

const SOC_ROLES: UserRole[] = ["OWNER", "ADMIN", "ANALYST"];

export class NotificationIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationIsolationError";
  }
}

export class NotificationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationValidationError";
  }
}

/** Internal deep-link paths only — no protocol, no // host trampoline. */
export function assertInternalHref(href: string | null | undefined): string | null {
  if (href == null || href === "") return null;
  const trimmed = href.trim();
  if (!trimmed.startsWith("/")) {
    throw new NotificationValidationError("Notification href must be an internal path");
  }
  if (trimmed.startsWith("//") || trimmed.includes("://")) {
    throw new NotificationValidationError("Notification href must not be an absolute URL");
  }
  if (trimmed.includes("\n") || trimmed.includes("\r")) {
    throw new NotificationValidationError("Notification href is invalid");
  }
  return trimmed;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

async function assertRecipientsInOrg(
  db: Db,
  organizationId: string,
  userIds: string[]
): Promise<void> {
  if (userIds.length === 0) return;
  const found = await db.user.findMany({
    where: { organizationId, id: { in: userIds } },
    select: { id: true },
  });
  if (found.length !== userIds.length) {
    throw new NotificationIsolationError(
      "One or more notification recipients are not in the organization"
    );
  }
}

async function validateSourceAttribution(
  db: Db,
  input: {
    organizationId: string;
    sourceType: NotificationSourceType;
    sourceId: string;
    clientId?: string | null;
    assetId?: string | null;
  }
): Promise<{ clientId: string | null; assetId: string | null }> {
  const { organizationId, sourceType, sourceId } = input;

  let sourceClientId: string | null = null;
  let sourceAssetId: string | null = null;

  if (sourceType === "INCIDENT") {
    const row = await db.incident.findFirst({
      where: { id: sourceId, organizationId },
      select: { id: true, clientId: true, assetId: true },
    });
    if (!row) {
      throw new NotificationIsolationError("Notification source incident not in organization");
    }
    sourceClientId = row.clientId;
    sourceAssetId = row.assetId;
  } else if (sourceType === "FINDING") {
    const row = await db.finding.findFirst({
      where: { id: sourceId, organizationId },
      select: { id: true, clientId: true, assetId: true },
    });
    if (!row) {
      throw new NotificationIsolationError("Notification source finding not in organization");
    }
    sourceClientId = row.clientId;
    sourceAssetId = row.assetId;
  } else if (sourceType === "INVESTIGATION") {
    const row = await db.investigationGroup.findFirst({
      where: { id: sourceId, organizationId },
      select: { id: true, clientId: true, assetId: true },
    });
    if (!row) {
      throw new NotificationIsolationError(
        "Notification source investigation not in organization"
      );
    }
    sourceClientId = row.clientId;
    sourceAssetId = row.assetId;
  } else if (sourceType === "SECURITY_EVENT") {
    const row = await db.securityEvent.findFirst({
      where: { id: sourceId, organizationId },
      select: { id: true, clientId: true, assetId: true },
    });
    if (!row) {
      throw new NotificationIsolationError(
        "Notification source security event not in organization"
      );
    }
    sourceClientId = row.clientId;
    sourceAssetId = row.assetId;
  } else if (sourceType === "SYSTEM") {
    // System notifications have no attributed source entity.
    sourceClientId = null;
    sourceAssetId = null;
  }

  // Cached clientId/assetId must match validated source when applicable.
  // Null/unattributed remains explicitly null — never inferred.
  if (input.clientId != null && input.clientId !== sourceClientId) {
    throw new NotificationIsolationError(
      "Notification clientId does not match validated source attribution"
    );
  }
  if (input.assetId != null && input.assetId !== sourceAssetId) {
    throw new NotificationIsolationError(
      "Notification assetId does not match validated source attribution"
    );
  }

  // Prefer explicit null when caller omits; use source values when provided as null/undefined
  // but never invent from metadata.
  const clientId =
    input.clientId === undefined ? sourceClientId : input.clientId;
  const assetId = input.assetId === undefined ? sourceAssetId : input.assetId;

  return { clientId: clientId ?? null, assetId: assetId ?? null };
}

/**
 * Create an idempotent notification + recipient fan-out.
 * Concurrent creates with the same dedupeKey resolve to one Notification.
 */
export async function createNotification(
  input: CreateNotificationInput,
  db: Db = prisma
): Promise<{ notification: Notification; created: boolean; recipientCount: number }> {
  const recipientUserIds = uniqueIds(input.recipientUserIds);
  const href = assertInternalHref(input.href);
  const dedupeKey = input.dedupeKey.trim();
  if (!dedupeKey) {
    throw new NotificationValidationError("dedupeKey is required");
  }

  await assertRecipientsInOrg(db, input.organizationId, recipientUserIds);
  const attribution = await validateSourceAttribution(db, {
    organizationId: input.organizationId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    clientId: input.clientId,
    assetId: input.assetId,
  });

  try {
    const notification = await db.notification.create({
      data: {
        organizationId: input.organizationId,
        type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        clientId: attribution.clientId,
        assetId: attribution.assetId,
        dedupeKey,
        href,
        expiresAt: input.expiresAt ?? null,
        recipients:
          recipientUserIds.length > 0
            ? {
                createMany: {
                  data: recipientUserIds.map((userId) => ({
                    organizationId: input.organizationId,
                    userId,
                  })),
                  skipDuplicates: true,
                },
              }
            : undefined,
      },
    });
    return {
      notification,
      created: true,
      recipientCount: recipientUserIds.length,
    };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await db.notification.findUnique({
        where: {
          organizationId_dedupeKey: {
            organizationId: input.organizationId,
            dedupeKey,
          },
        },
      });
      if (!existing) throw err;
      return { notification: existing, created: false, recipientCount: 0 };
    }
    throw err;
  }
}

/** Users with SOC roles in org (excludes VIEWER). */
export async function listSocRecipientUserIds(
  organizationId: string,
  db: Db = prisma
): Promise<string[]> {
  const users = await db.user.findMany({
    where: { organizationId, role: { in: SOC_ROLES } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** ADMIN + OWNER only. */
export async function listAdminOwnerUserIds(
  organizationId: string,
  db: Db = prisma
): Promise<string[]> {
  const users = await db.user.findMany({
    where: { organizationId, role: { in: ["ADMIN", "OWNER"] } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

function mapInboxItem(row: {
  id: string;
  readAt: Date | null;
  dismissedAt: Date | null;
  notification: {
    id: string;
    type: NotificationInboxItem["type"];
    severity: NotificationInboxItem["severity"];
    title: string;
    message: string;
    sourceType: NotificationInboxItem["sourceType"];
    sourceId: string;
    clientId: string | null;
    assetId: string | null;
    href: string | null;
    createdAt: Date;
  };
}): NotificationInboxItem {
  return {
    recipientId: row.id,
    notificationId: row.notification.id,
    type: row.notification.type,
    severity: row.notification.severity,
    title: row.notification.title,
    message: row.notification.message,
    sourceType: row.notification.sourceType,
    sourceId: row.notification.sourceId,
    clientId: row.notification.clientId,
    assetId: row.notification.assetId,
    href: row.notification.href,
    createdAt: row.notification.createdAt,
    readAt: row.readAt,
    dismissedAt: row.dismissedAt,
  };
}

function inboxWhere(input: {
  organizationId: string;
  userId: string;
  filter: NotificationInboxFilter;
  includeDismissed?: boolean;
}): Prisma.NotificationRecipientWhereInput {
  const base: Prisma.NotificationRecipientWhereInput = {
    organizationId: input.organizationId,
    userId: input.userId,
    ...(input.includeDismissed ? {} : { dismissedAt: null }),
    notification: { organizationId: input.organizationId },
  };

  switch (input.filter) {
    case "UNREAD":
      return { ...base, readAt: null };
    case "CRITICAL":
      return {
        ...base,
        notification: {
          organizationId: input.organizationId,
          severity: "CRITICAL",
        },
      };
    case "SLA":
      return {
        ...base,
        notification: {
          organizationId: input.organizationId,
          type: { in: SLA_NOTIFICATION_TYPES },
        },
      };
    case "ASSIGNMENTS":
      return {
        ...base,
        notification: {
          organizationId: input.organizationId,
          type: { in: ASSIGNMENT_NOTIFICATION_TYPES },
        },
      };
    case "ALL":
    default:
      return base;
  }
}

export async function listNotificationInbox(input: {
  organizationId: string;
  userId: string;
  filter?: NotificationInboxFilter;
  page?: number;
  pageSize?: number;
}): Promise<ListInboxResult> {
  const filter = input.filter ?? "ALL";
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const where = inboxWhere({
    organizationId: input.organizationId,
    userId: input.userId,
    filter,
  });

  const [total, unreadCount, rows] = await Promise.all([
    prisma.notificationRecipient.count({ where }),
    prisma.notificationRecipient.count({
      where: {
        organizationId: input.organizationId,
        userId: input.userId,
        dismissedAt: null,
        readAt: null,
        notification: { organizationId: input.organizationId },
      },
    }),
    prisma.notificationRecipient.findMany({
      where,
      include: { notification: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: rows.map(mapInboxItem),
    total,
    unreadCount,
    page,
    pageSize,
  };
}

export async function getUnreadNotificationCount(input: {
  organizationId: string;
  userId: string;
}): Promise<number> {
  return prisma.notificationRecipient.count({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
      dismissedAt: null,
      readAt: null,
      notification: { organizationId: input.organizationId },
    },
  });
}

async function getOwnRecipientOrThrow(input: {
  organizationId: string;
  userId: string;
  recipientId: string;
}) {
  const row = await prisma.notificationRecipient.findFirst({
    where: {
      id: input.recipientId,
      organizationId: input.organizationId,
      userId: input.userId,
      notification: { organizationId: input.organizationId },
    },
  });
  if (!row) {
    throw new NotificationIsolationError("Notification recipient not found");
  }
  return row;
}

export async function markNotificationRead(input: {
  organizationId: string;
  userId: string;
  recipientId: string;
}): Promise<void> {
  await getOwnRecipientOrThrow(input);
  await prisma.notificationRecipient.updateMany({
    where: {
      id: input.recipientId,
      organizationId: input.organizationId,
      userId: input.userId,
    },
    data: { readAt: new Date() },
  });
}

export async function markNotificationUnread(input: {
  organizationId: string;
  userId: string;
  recipientId: string;
}): Promise<void> {
  await getOwnRecipientOrThrow(input);
  await prisma.notificationRecipient.updateMany({
    where: {
      id: input.recipientId,
      organizationId: input.organizationId,
      userId: input.userId,
    },
    data: { readAt: null },
  });
}

export async function dismissNotification(input: {
  organizationId: string;
  userId: string;
  recipientId: string;
}): Promise<void> {
  await getOwnRecipientOrThrow(input);
  await prisma.notificationRecipient.updateMany({
    where: {
      id: input.recipientId,
      organizationId: input.organizationId,
      userId: input.userId,
    },
    data: { dismissedAt: new Date() },
  });
}

export async function markAllNotificationsRead(input: {
  organizationId: string;
  userId: string;
}): Promise<number> {
  const result = await prisma.notificationRecipient.updateMany({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
      dismissedAt: null,
      readAt: null,
      notification: { organizationId: input.organizationId },
    },
    data: { readAt: new Date() },
  });
  return result.count;
}
