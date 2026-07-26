import type { Prisma, WazuhProcessedDisposition } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import {
  WAZUH_CORRELATION_WINDOW_MS,
  WAZUH_INGESTION_BATCH_SIZE,
  WAZUH_SCA_CORRELATION_WINDOW_MS,
} from "@/lib/wazuh/constants";
import { isWazuhCheckpointForward } from "@/lib/wazuh/ingestion-cursor";
import {
  categorizeWazuhIngestionError,
  isRetriableWazuhIngestionError,
  shouldAbortWazuhSyncPageLoop,
} from "@/lib/wazuh/ingestion-errors";
import { logWazuhIngestion } from "@/lib/wazuh/ingestion-log";
import { createAuditLog } from "@/services/audit.service";
import {
  classifyWazuhAlert,
  isScaAlert,
} from "@/services/wazuh/wazuh-classification.service";
import {
  buildCorrelationKey,
  buildCorrelationSummary,
  isWithinCorrelationWindow,
} from "@/services/wazuh/wazuh-correlation.service";
import {
  recordOrUpdateCorrelatedOccurrence,
  recordSecurityEventActivity,
} from "@/services/security-events/security-event-activity.service";
import {
  acquireWazuhIngestionDbLock,
  assertWazuhIngestionDbLockRenewed,
  releaseWazuhIngestionDbLock,
  WazuhIngestionLockError,
} from "@/services/wazuh/wazuh-ingestion-lock.service";
import { evaluateWazuhIngestionPolicy } from "@/services/wazuh/wazuh-ingestion-policy.service";
import {
  getNewestWazuhAlertTimestamp,
  searchWazuhAlerts,
} from "@/services/wazuh/wazuh-indexer-client.service";
import { normalizeWazuhAlertHit } from "@/services/wazuh/wazuh-normalizer.service";
import { sanitizeFreeText } from "@/services/wazuh/wazuh-sanitizer.service";

export type WazuhSyncMode = "FROM_NOW" | "LAST_1H" | "LAST_24H";

export interface WazuhSyncResult {
  processed: number;
  created: number;
  updated: number;
  filtered: number;
  ignored: number;
  skippedDuplicates: number;
  skippedMalformed: number;
  errors: number;
  retries: number;
  lastTimestamp: Date | null;
  lastDocumentId: string | null;
  durationMs: number;
  /** SecurityEvent ids created in this sync (EVENT_CREATED only). */
  createdSecurityEventIds: string[];
}

export interface WazuhInitializeResult {
  checkpointTimestamp: Date;
  basedOnNewestAlert: boolean;
  previousCheckpoint: Date | null;
}

type TxClient = Prisma.TransactionClient;

type AgentMapping = {
  wazuhAgentId: string;
  clientId: string | null;
  assetId: string | null;
};

function resolveConfiguredOrganizationId(sessionOrgId: string): string {
  const configured = serverEnv.WAZUH_ORGANIZATION_ID;
  if (!configured) {
    throw new Error("WAZUH_ORGANIZATION_ID is required for Wazuh ingestion");
  }
  if (configured !== sessionOrgId) {
    throw new Error("Wazuh ingestion is not configured for this organization");
  }
  return configured;
}

function initialCursorForMode(mode: WazuhSyncMode): Date {
  const now = new Date();
  if (mode === "LAST_1H") {
    return new Date(now.getTime() - 60 * 60 * 1000);
  }
  if (mode === "LAST_24H") {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  return now;
}

function correlationWindowMs(alertIsSca: boolean): number {
  if (alertIsSca) {
    return (
      (serverEnv.WAZUH_SCA_CORRELATION_WINDOW_MINUTES || 1440) * 60 * 1000 ||
      WAZUH_SCA_CORRELATION_WINDOW_MS
    );
  }
  return (
    (serverEnv.WAZUH_CORRELATION_WINDOW_MINUTES || 15) * 60 * 1000 ||
    WAZUH_CORRELATION_WINDOW_MS
  );
}

function correlationWindowLabel(alertIsSca: boolean): string {
  if (alertIsSca) {
    const minutes = serverEnv.WAZUH_SCA_CORRELATION_WINDOW_MINUTES || 1440;
    return minutes % 60 === 0
      ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}`
      : `${minutes} minutes`;
  }
  const minutes = serverEnv.WAZUH_CORRELATION_WINDOW_MINUTES || 15;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

async function getOrCreateIngestionState(organizationId: string) {
  return prisma.wazuhIngestionState.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });
}

function emptyResult(
  lastTimestamp: Date | null,
  lastDocumentId: string | null
): WazuhSyncResult {
  return {
    processed: 0,
    created: 0,
    updated: 0,
    filtered: 0,
    ignored: 0,
    skippedDuplicates: 0,
    skippedMalformed: 0,
    errors: 0,
    retries: 0,
    lastTimestamp,
    lastDocumentId,
    durationMs: 0,
    createdSecurityEventIds: [],
  };
}

async function advanceCheckpointInTx(
  tx: TxClient,
  input: {
    organizationId: string;
    current: { timestamp: Date | null; documentId: string | null };
    nextTimestamp: Date;
    nextDocumentId: string;
  }
): Promise<{ timestamp: Date; documentId: string } | null> {
  if (
    !isWazuhCheckpointForward(input.current, {
      timestamp: input.nextTimestamp,
      documentId: input.nextDocumentId,
    })
  ) {
    return null;
  }
  await tx.wazuhIngestionState.update({
    where: { organizationId: input.organizationId },
    data: {
      lastTimestamp: input.nextTimestamp,
      lastDocumentId: input.nextDocumentId,
    },
  });
  return {
    timestamp: input.nextTimestamp,
    documentId: input.nextDocumentId,
  };
}

/**
 * Initialize the ingestion checkpoint without importing any historical alerts.
 */
export async function initializeWazuhIngestionFromNow(input: {
  organizationId: string;
  actorId: string;
}): Promise<WazuhInitializeResult> {
  const organizationId = resolveConfiguredOrganizationId(input.organizationId);
  const lockedBy = `init:${input.actorId}:${randomUUID().slice(0, 8)}`;

  await acquireWazuhIngestionDbLock({ organizationId, lockedBy });

  try {
    const state = await getOrCreateIngestionState(organizationId);
    const previousCheckpoint = state.lastTimestamp;

    await prisma.wazuhIngestionState.update({
      where: { organizationId },
      data: { lastAttemptAt: new Date(), lastError: null },
    });

    await createAuditLog({
      organizationId,
      actorId: input.actorId,
      action: "WAZUH_INGESTION_INITIALIZE_REQUESTED",
      resourceType: "WazuhIngestion",
      resourceId: state.id,
      metadata: {
        previousCheckpoint: previousCheckpoint?.toISOString() ?? null,
      },
    });

    let checkpointTimestamp = new Date();
    let basedOnNewestAlert = false;

    try {
      const newest = await getNewestWazuhAlertTimestamp();
      if (newest) {
        checkpointTimestamp = newest;
        basedOnNewestAlert = true;
      }
    } catch {
      checkpointTimestamp = new Date();
      basedOnNewestAlert = false;
    }

    await prisma.wazuhIngestionState.update({
      where: { organizationId },
      data: {
        lastTimestamp: checkpointTimestamp,
        lastDocumentId: null,
        lastSuccessfulSyncAt: new Date(),
        lastError: null,
      },
    });

    logWazuhIngestion("info", "Ingestion checkpoint initialized", {
      organizationId,
      checkpointTimestamp: checkpointTimestamp.toISOString(),
      basedOnNewestAlert,
    });

    await createAuditLog({
      organizationId,
      actorId: input.actorId,
      action: "WAZUH_INGESTION_INITIALIZED",
      resourceType: "WazuhIngestion",
      resourceId: state.id,
      metadata: {
        checkpointTimestamp: checkpointTimestamp.toISOString(),
        basedOnNewestAlert,
        previousCheckpoint: previousCheckpoint?.toISOString() ?? null,
        importedAlerts: 0,
      },
    });

    return {
      checkpointTimestamp,
      basedOnNewestAlert,
      previousCheckpoint,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Wazuh initialization failed";
    await prisma.wazuhIngestionState
      .update({
        where: { organizationId },
        data: {
          lastError: message.slice(0, 500),
          lastFailedSyncAt: new Date(),
        },
      })
      .catch(() => {});
    await createAuditLog({
      organizationId,
      actorId: input.actorId,
      action: "WAZUH_INGESTION_INITIALIZE_FAILED",
      resourceType: "WazuhIngestion",
      resourceId: organizationId,
      metadata: { error: message.slice(0, 200) },
    }).catch(() => {});
    throw error;
  } finally {
    await releaseWazuhIngestionDbLock({ organizationId, lockedBy });
  }
}

/**
 * Manual incremental sync strictly from the saved checkpoint.
 */
export async function syncWazuhNewEventsFromCheckpoint(input: {
  organizationId: string;
  actorId: string;
  lockedBy?: string;
}): Promise<WazuhSyncResult> {
  const organizationId = resolveConfiguredOrganizationId(input.organizationId);
  const state = await getOrCreateIngestionState(organizationId);
  if (!state.lastTimestamp) {
    throw new Error(
      "Ingestion is not initialized. Run Initialize From Now before syncing."
    );
  }

  return syncWazuhSecurityEvents({
    organizationId: input.organizationId,
    actorId: input.actorId,
    mode: "FROM_NOW",
    continueFromCheckpoint: true,
    lockedBy: input.lockedBy,
  });
}

type AlertCommitOutcome =
  | { kind: "duplicate" }
  | { kind: "malformed" }
  | { kind: "filtered"; disposition: WazuhProcessedDisposition }
  | {
      kind: "ingested";
      disposition: "EVENT_CREATED" | "EVENT_CORRELATED";
      securityEventId: string;
      ignored: boolean;
    };

async function commitAlertInTransaction(input: {
  organizationId: string;
  documentId: string;
  hitSource: Record<string, unknown> | undefined;
  continueFromCheckpoint: boolean;
  checkpointSnapshot: Date | null;
  mappingByAgent: Map<string, AgentMapping>;
  cursor: { timestamp: Date | null; documentId: string | null };
}): Promise<{
  outcome: AlertCommitOutcome;
  cursor: { timestamp: Date | null; documentId: string | null };
}> {
  return prisma.$transaction(
    async (tx) => {
      let cursor = { ...input.cursor };

      const existing = await tx.wazuhProcessedAlert.findUnique({
        where: {
          organizationId_documentId: {
            organizationId: input.organizationId,
            documentId: input.documentId,
          },
        },
      });

      if (existing) {
        const ts = input.hitSource?.timestamp
          ? new Date(String(input.hitSource.timestamp))
          : null;
        if (ts && !Number.isNaN(ts.getTime())) {
          const advanced = await advanceCheckpointInTx(tx, {
            organizationId: input.organizationId,
            current: cursor,
            nextTimestamp: ts,
            nextDocumentId: input.documentId,
          });
          if (advanced) cursor = advanced;
        }
        return { outcome: { kind: "duplicate" as const }, cursor };
      }

      const normalized = normalizeWazuhAlertHit({
        _id: input.documentId,
        _source: input.hitSource,
      });

      if (!normalized) {
        await tx.wazuhProcessedAlert.create({
          data: {
            organizationId: input.organizationId,
            documentId: input.documentId,
            disposition: "MALFORMED",
            filterReason: "Failed normalization",
          },
        });
        const ts = input.hitSource?.timestamp
          ? new Date(String(input.hitSource.timestamp))
          : null;
        if (ts && !Number.isNaN(ts.getTime())) {
          const advanced = await advanceCheckpointInTx(tx, {
            organizationId: input.organizationId,
            current: cursor,
            nextTimestamp: ts,
            nextDocumentId: input.documentId,
          });
          if (advanced) cursor = advanced;
        }
        return { outcome: { kind: "malformed" as const }, cursor };
      }

      if (
        input.continueFromCheckpoint &&
        input.checkpointSnapshot &&
        normalized.timestamp.getTime() < input.checkpointSnapshot.getTime()
      ) {
        // Strictly before checkpoint tip (defense in depth for search_after).
        await tx.wazuhProcessedAlert.create({
          data: {
            organizationId: input.organizationId,
            documentId: normalized.documentId,
            alertTimestamp: normalized.timestamp,
            disposition: "DUPLICATE",
            filterReason: "Before checkpoint",
          },
        });
        const advanced = await advanceCheckpointInTx(tx, {
          organizationId: input.organizationId,
          current: cursor,
          nextTimestamp: normalized.timestamp,
          nextDocumentId: normalized.documentId,
        });
        if (advanced) cursor = advanced;
        return { outcome: { kind: "duplicate" as const }, cursor };
      }

      // Same-timestamp at checkpoint: allow if documentId is after tip.
      if (
        input.continueFromCheckpoint &&
        input.checkpointSnapshot &&
        normalized.timestamp.getTime() === input.checkpointSnapshot.getTime() &&
        cursor.documentId &&
        normalized.documentId <= cursor.documentId
      ) {
        await tx.wazuhProcessedAlert.create({
          data: {
            organizationId: input.organizationId,
            documentId: normalized.documentId,
            alertTimestamp: normalized.timestamp,
            disposition: "DUPLICATE",
            filterReason: "At or before checkpoint document",
          },
        });
        return { outcome: { kind: "duplicate" as const }, cursor };
      }

      const policy = evaluateWazuhIngestionPolicy(normalized);
      if (policy.action === "FILTER") {
        await tx.wazuhProcessedAlert.create({
          data: {
            organizationId: input.organizationId,
            documentId: normalized.documentId,
            alertTimestamp: normalized.timestamp,
            disposition: policy.disposition,
            filterReason: policy.reason.slice(0, 500),
          },
        });
        const advanced = await advanceCheckpointInTx(tx, {
          organizationId: input.organizationId,
          current: cursor,
          nextTimestamp: normalized.timestamp,
          nextDocumentId: normalized.documentId,
        });
        if (advanced) cursor = advanced;
        return {
          outcome: {
            kind: "filtered" as const,
            disposition: policy.disposition,
          },
          cursor,
        };
      }

      const classification = classifyWazuhAlert(normalized);
      const ignored = classification === "IGNORED";

      const mapping = normalized.agentId
        ? input.mappingByAgent.get(normalized.agentId)
        : undefined;
      const applyMapping =
        mapping &&
        normalized.agentId !== "000" &&
        mapping.clientId &&
        mapping.assetId
          ? mapping
          : null;

      const assetId = applyMapping?.assetId ?? null;
      const correlationKey = buildCorrelationKey({
        organizationId: input.organizationId,
        assetId,
        alert: normalized,
      });

      const alertIsSca = isScaAlert(normalized);
      const windowMs = correlationWindowMs(alertIsSca);
      const windowLabel = correlationWindowLabel(alertIsSca);

      const openEvent = await tx.securityEvent.findFirst({
        where: {
          organizationId: input.organizationId,
          correlationKey,
          status: { in: ["NEW", "REVIEWING", "ACKNOWLEDGED"] },
        },
        orderBy: { lastSeenAt: "desc" },
      });

      let securityEventId: string;
      let disposition: "EVENT_CREATED" | "EVENT_CORRELATED";

      if (
        openEvent &&
        isWithinCorrelationWindow(
          openEvent.lastSeenAt,
          normalized.timestamp,
          windowMs
        )
      ) {
        const nextCount = openEvent.occurrenceCount + 1;
        const correlationSummary = buildCorrelationSummary({
          organizationId: input.organizationId,
          assetId,
          alert: normalized,
          occurrenceCount: nextCount,
          windowLabel,
        });
        const updated = await tx.securityEvent.update({
          where: { id: openEvent.id },
          data: {
            lastSeenAt: normalized.timestamp,
            occurrenceCount: { increment: 1 },
            externalEventId: normalized.documentId,
            classification,
            correlationSummary,
            scaCheckId: normalized.scaCheckId ?? openEvent.scaCheckId,
            username: normalized.username ?? openEvent.username,
            processName: normalized.processName ?? openEvent.processName,
            filePath: normalized.filePath ?? openEvent.filePath,
            commandLine:
              sanitizeFreeText(normalized.commandLine, 500) ??
              openEvent.commandLine,
            rawDataSanitized:
              normalized.rawDataSanitized as Prisma.InputJsonValue,
          },
        });
        securityEventId = updated.id;
        disposition = "EVENT_CORRELATED";
        await recordOrUpdateCorrelatedOccurrence({
          organizationId: input.organizationId,
          securityEventId,
          occurrenceCount: updated.occurrenceCount,
          correlationSummary,
          db: tx,
        });
      } else {
        const correlationSummary = buildCorrelationSummary({
          organizationId: input.organizationId,
          assetId,
          alert: normalized,
          occurrenceCount: 1,
          windowLabel,
        });
        const created = await tx.securityEvent.create({
          data: {
            organizationId: input.organizationId,
            clientId: applyMapping?.clientId ?? null,
            assetId,
            source: "WAZUH",
            externalEventId: normalized.documentId,
            ruleId: normalized.ruleId,
            ruleLevel: normalized.ruleLevel,
            ruleDescription: sanitizeFreeText(
              normalized.ruleDescription,
              2000
            ),
            ruleGroups: normalized.ruleGroups,
            agentId: normalized.agentId,
            agentName: normalized.agentName,
            severity: normalized.severity,
            status: "NEW",
            classification,
            title: sanitizeFreeText(normalized.title, 300) ?? "Wazuh alert",
            summary: sanitizeFreeText(normalized.summary, 2000),
            firstSeenAt: normalized.timestamp,
            lastSeenAt: normalized.timestamp,
            occurrenceCount: 1,
            correlationKey,
            correlationSummary,
            scaCheckId: normalized.scaCheckId,
            sourceIp: normalized.sourceIp,
            destinationIp: normalized.destinationIp,
            sourcePort: normalized.sourcePort,
            destinationPort: normalized.destinationPort,
            protocol: normalized.protocol,
            username: sanitizeFreeText(normalized.username, 200),
            processName: sanitizeFreeText(normalized.processName, 300),
            filePath: sanitizeFreeText(normalized.filePath, 1000),
            commandLine: sanitizeFreeText(normalized.commandLine, 500),
            mitreTactics: normalized.mitreTactics,
            mitreTechniques: normalized.mitreTechniques,
            pciDss: normalized.pciDss,
            gdpr: normalized.gdpr,
            hipaa: normalized.hipaa,
            nist: normalized.nist,
            rawDataSanitized:
              normalized.rawDataSanitized as Prisma.InputJsonValue,
          },
        });
        securityEventId = created.id;
        disposition = "EVENT_CREATED";
        await recordSecurityEventActivity({
          organizationId: input.organizationId,
          securityEventId,
          activityType: "CREATED",
          message: `Security event created from Wazuh alert (${normalized.ruleId ?? "unknown rule"}).`,
          metadata: {
            documentId: normalized.documentId,
            ruleId: normalized.ruleId,
          },
          db: tx,
        });
      }

      await tx.wazuhProcessedAlert.create({
        data: {
          organizationId: input.organizationId,
          documentId: normalized.documentId,
          securityEventId,
          alertTimestamp: normalized.timestamp,
          disposition,
        },
      });

      const advanced = await advanceCheckpointInTx(tx, {
        organizationId: input.organizationId,
        current: cursor,
        nextTimestamp: normalized.timestamp,
        nextDocumentId: normalized.documentId,
      });
      if (advanced) cursor = advanced;

      return {
        outcome: {
          kind: "ingested" as const,
          disposition,
          securityEventId,
          ignored,
        },
        cursor,
      };
    },
    { timeout: 30_000 }
  );
}

/**
 * Controlled Wazuh → Security Events sync (manual or scheduled).
 * Forward-only, transactional per alert, lock-renewed across pages.
 */
export async function syncWazuhSecurityEvents(input: {
  organizationId: string;
  actorId: string;
  mode: WazuhSyncMode;
  continueFromCheckpoint?: boolean;
  lockedBy?: string;
}): Promise<WazuhSyncResult> {
  const organizationId = resolveConfiguredOrganizationId(input.organizationId);
  const lockedBy =
    input.lockedBy ?? `sync:${input.actorId}:${randomUUID().slice(0, 8)}`;
  const startedAt = Date.now();
  const correlationId = randomUUID().slice(0, 12);

  try {
    await acquireWazuhIngestionDbLock({ organizationId, lockedBy });
  } catch (error) {
    if (error instanceof WazuhIngestionLockError) throw error;
    throw error;
  }

  const state = await getOrCreateIngestionState(organizationId);

  try {
    await prisma.wazuhIngestionState.update({
      where: { organizationId },
      data: { lastAttemptAt: new Date(), lastError: null },
    });

    await createAuditLog({
      organizationId,
      actorId: input.actorId,
      action: "WAZUH_SYNC_REQUESTED",
      resourceType: "WazuhIngestion",
      resourceId: state.id,
      metadata: {
        mode: input.mode,
        continueFromCheckpoint: Boolean(input.continueFromCheckpoint),
        lockedBy,
        correlationId,
      },
    });

    logWazuhIngestion("info", "Sync started", {
      correlationId,
      organizationId,
      mode: input.mode,
      continueFromCheckpoint: Boolean(input.continueFromCheckpoint),
      checkpointTimestamp: state.lastTimestamp?.toISOString() ?? null,
      checkpointDocumentId: state.lastDocumentId ?? null,
    });

    const result = emptyResult(state.lastTimestamp, state.lastDocumentId);

    if (input.continueFromCheckpoint && !state.lastTimestamp) {
      throw new Error(
        "Ingestion is not initialized. Run Initialize From Now before syncing."
      );
    }

    let afterTimestamp =
      input.continueFromCheckpoint && state.lastTimestamp
        ? state.lastTimestamp
        : initialCursorForMode(input.mode);
    let afterDocumentId: string | null =
      input.continueFromCheckpoint && state.lastTimestamp
        ? state.lastDocumentId
        : null;

    if (
      input.mode === "FROM_NOW" &&
      !state.lastTimestamp &&
      !input.continueFromCheckpoint
    ) {
      await prisma.wazuhIngestionState.update({
        where: { organizationId },
        data: {
          lastTimestamp: afterTimestamp,
          lastDocumentId: null,
          lastSuccessfulSyncAt: new Date(),
          lastError: null,
        },
      });
      result.durationMs = Date.now() - startedAt;
      await createAuditLog({
        organizationId,
        actorId: input.actorId,
        action: "WAZUH_SYNC_COMPLETED",
        resourceType: "WazuhIngestion",
        resourceId: state.id,
        metadata: { mode: input.mode, initializedCheckpoint: true, ...result },
      });
      return result;
    }

    // Snapshot for defense-in-depth skip comparisons — never move backwards.
    const checkpointSnapshot = state.lastTimestamp;
    let cursor = {
      timestamp: state.lastTimestamp,
      documentId: state.lastDocumentId,
    };

    const mappings = await prisma.wazuhAgentMapping.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: {
        wazuhAgentId: true,
        clientId: true,
        assetId: true,
      },
    });
    const mappingByAgent = new Map(
      mappings.map((m) => [m.wazuhAgentId, m] as const)
    );

    let hasMore = true;
    let abortReason: string | null = null;

    while (hasMore) {
      await assertWazuhIngestionDbLockRenewed({ organizationId, lockedBy });

      let page;
      try {
        page = await searchWazuhAlerts({
          afterTimestamp,
          afterDocumentId,
          size: WAZUH_INGESTION_BATCH_SIZE,
        });
      } catch (error) {
        const category = categorizeWazuhIngestionError(error);
        if (isRetriableWazuhIngestionError(category)) {
          result.retries++;
          logWazuhIngestion("warn", "Retrying indexer search", {
            correlationId,
            category,
          });
          try {
            page = await searchWazuhAlerts({
              afterTimestamp,
              afterDocumentId,
              size: WAZUH_INGESTION_BATCH_SIZE,
            });
          } catch (retryError) {
            const retryCategory = categorizeWazuhIngestionError(retryError);
            logWazuhIngestion("error", "Indexer search failed after retry", {
              correlationId,
              category: retryCategory,
              error:
                retryError instanceof Error
                  ? retryError.message.slice(0, 200)
                  : "unknown",
            });
            result.errors++;
            abortReason = retryCategory;
            hasMore = false;
            break;
          }
        } else {
          logWazuhIngestion("error", "Indexer search failed", {
            correlationId,
            category,
            error:
              error instanceof Error ? error.message.slice(0, 200) : "unknown",
          });
          result.errors++;
          abortReason = category;
          hasMore = false;
          break;
        }
      }

      if (page.hits.length === 0) {
        hasMore = false;
        break;
      }

      // Batch ledger lookup — reduces per-alert duplicate queries.
      const pageIds = page.hits.map((h) => h._id);
      const existingRows = await prisma.wazuhProcessedAlert.findMany({
        where: {
          organizationId,
          documentId: { in: pageIds },
        },
        select: { documentId: true },
      });
      const existingSet = new Set(existingRows.map((r) => r.documentId));

      for (const hit of page.hits) {
        result.processed++;

        const processOnce = async () =>
          commitAlertInTransaction({
            organizationId,
            documentId: hit._id,
            hitSource: hit._source,
            continueFromCheckpoint: Boolean(input.continueFromCheckpoint),
            checkpointSnapshot,
            mappingByAgent,
            cursor,
          });

        try {
          // Fast path: already in ledger — still advance cursor transactionally.
          if (existingSet.has(hit._id)) {
            const committed = await processOnce();
            cursor = committed.cursor;
            result.skippedDuplicates++;
            result.lastTimestamp = cursor.timestamp;
            result.lastDocumentId = cursor.documentId;
            afterTimestamp = cursor.timestamp ?? afterTimestamp;
            afterDocumentId = cursor.documentId;
            continue;
          }

          let committed;
          try {
            committed = await processOnce();
          } catch (firstError) {
            const category = categorizeWazuhIngestionError(firstError);
            if (category === "DUPLICATE") {
              result.skippedDuplicates++;
              // Re-read cursor from DB after concurrent commit.
              const fresh = await prisma.wazuhIngestionState.findUnique({
                where: { organizationId },
                select: { lastTimestamp: true, lastDocumentId: true },
              });
              if (fresh) {
                cursor = {
                  timestamp: fresh.lastTimestamp,
                  documentId: fresh.lastDocumentId,
                };
                result.lastTimestamp = cursor.timestamp;
                result.lastDocumentId = cursor.documentId;
                afterTimestamp = cursor.timestamp ?? afterTimestamp;
                afterDocumentId = cursor.documentId;
              }
              continue;
            }
            if (isRetriableWazuhIngestionError(category)) {
              result.retries++;
              logWazuhIngestion("warn", "Retrying alert commit", {
                correlationId,
                category,
                documentId: hit._id,
              });
              committed = await processOnce();
            } else if (shouldAbortWazuhSyncPageLoop(category)) {
              result.errors++;
              abortReason = category;
              logWazuhIngestion("error", "Aborting sync page loop", {
                correlationId,
                category,
                documentId: hit._id,
                error:
                  firstError instanceof Error
                    ? firstError.message.slice(0, 200)
                    : "unknown",
              });
              hasMore = false;
              break;
            } else {
              result.errors++;
              logWazuhIngestion("warn", "Alert commit failed; continuing", {
                correlationId,
                category,
                documentId: hit._id,
                error:
                  firstError instanceof Error
                    ? firstError.message.slice(0, 200)
                    : "unknown",
              });
              continue;
            }
          }

          cursor = committed.cursor;
          result.lastTimestamp = cursor.timestamp;
          result.lastDocumentId = cursor.documentId;
          afterTimestamp = cursor.timestamp ?? afterTimestamp;
          afterDocumentId = cursor.documentId;

          switch (committed.outcome.kind) {
            case "duplicate":
              result.skippedDuplicates++;
              break;
            case "malformed":
              result.skippedMalformed++;
              break;
            case "filtered":
              result.filtered++;
              break;
            case "ingested":
              if (committed.outcome.ignored) result.ignored++;
              if (committed.outcome.disposition === "EVENT_CREATED") {
                result.created++;
                result.createdSecurityEventIds.push(
                  committed.outcome.securityEventId
                );
              } else {
                result.updated++;
              }
              break;
          }
        } catch (error) {
          const category = categorizeWazuhIngestionError(error);
          result.errors++;
          logWazuhIngestion("error", "Unexpected alert processing failure", {
            correlationId,
            category,
            documentId: hit._id,
            error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
          });
          if (shouldAbortWazuhSyncPageLoop(category)) {
            abortReason = category;
            hasMore = false;
            break;
          }
        }
      }

      if (abortReason) {
        hasMore = false;
        break;
      }

      if (page.hits.length < WAZUH_INGESTION_BATCH_SIZE) {
        hasMore = false;
      } else if (cursor.timestamp) {
        // Next page resumes strictly after last committed cursor via search_after.
        afterTimestamp = cursor.timestamp;
        afterDocumentId = cursor.documentId;
      }
    }

    result.durationMs = Date.now() - startedAt;

    const hardFailure = Boolean(abortReason);
    const softErrors = result.errors > 0 && !hardFailure;

    await prisma.wazuhIngestionState.update({
      where: { organizationId },
      data: {
        lastSuccessfulSyncAt: hardFailure ? undefined : new Date(),
        lastFailedSyncAt: hardFailure || softErrors ? new Date() : undefined,
        lastError: hardFailure
          ? `Aborted: ${abortReason} (${result.errors} error(s))`.slice(0, 500)
          : softErrors
            ? `Completed with ${result.errors} processing error(s)`
            : null,
        lastSyncDurationMs: result.durationMs,
        lastSyncProcessed: result.processed,
        lastSyncCreated: result.created,
        lastSyncUpdated: result.updated,
        lastSyncFiltered: result.filtered,
        lastSyncIgnored: result.ignored,
        lastSyncSkippedDuplicates: result.skippedDuplicates,
        lastSyncSkippedMalformed: result.skippedMalformed,
        lastSyncErrors: result.errors,
        lastSyncRetries: result.retries,
      },
    });

    logWazuhIngestion("info", "Sync completed", {
      correlationId,
      organizationId,
      processed: result.processed,
      created: result.created,
      updated: result.updated,
      filtered: result.filtered,
      ignored: result.ignored,
      skippedDuplicates: result.skippedDuplicates,
      skippedMalformed: result.skippedMalformed,
      errors: result.errors,
      retries: result.retries,
      durationMs: result.durationMs,
      checkpointTimestamp: result.lastTimestamp?.toISOString() ?? null,
      checkpointDocumentId: result.lastDocumentId,
      abortReason,
    });

    await createAuditLog({
      organizationId,
      actorId: input.actorId,
      action: "WAZUH_SYNC_COMPLETED",
      resourceType: "WazuhIngestion",
      resourceId: state.id,
      metadata: {
        mode: input.mode,
        correlationId,
        processed: result.processed,
        created: result.created,
        updated: result.updated,
        filtered: result.filtered,
        ignored: result.ignored,
        skippedDuplicates: result.skippedDuplicates,
        skippedMalformed: result.skippedMalformed,
        errors: result.errors,
        retries: result.retries,
        durationMs: result.durationMs,
        lastTimestamp: result.lastTimestamp?.toISOString() ?? null,
        lastDocumentId: result.lastDocumentId,
        abortReason,
      },
    });

    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Wazuh sync failed";
    const category = categorizeWazuhIngestionError(error);
    logWazuhIngestion("error", "Sync failed", {
      correlationId,
      organizationId,
      category,
      error: message.slice(0, 200),
    });
    await prisma.wazuhIngestionState.update({
      where: { organizationId },
      data: {
        lastError: message.slice(0, 500),
        lastFailedSyncAt: new Date(),
      },
    });
    await createAuditLog({
      organizationId,
      actorId: input.actorId,
      action: "WAZUH_SYNC_FAILED",
      resourceType: "WazuhIngestion",
      resourceId: state.id,
      metadata: {
        mode: input.mode,
        correlationId,
        category,
        error: message.slice(0, 200),
      },
    });
    throw error;
  } finally {
    await releaseWazuhIngestionDbLock({ organizationId, lockedBy });
  }
}
