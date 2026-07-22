import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import {
  WAZUH_CORRELATION_WINDOW_MS,
  WAZUH_INGESTION_BATCH_SIZE,
  WAZUH_SCA_CORRELATION_WINDOW_MS,
} from "@/lib/wazuh/constants";
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
  lastTimestamp: Date | null;
  durationMs: number;
  /** SecurityEvent ids created in this sync (EVENT_CREATED only). Optional for callers. */
  createdSecurityEventIds: string[];
}

export interface WazuhInitializeResult {
  checkpointTimestamp: Date;
  basedOnNewestAlert: boolean;
  previousCheckpoint: Date | null;
}

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

function emptyResult(lastTimestamp: Date | null): WazuhSyncResult {
  return {
    processed: 0,
    created: 0,
    updated: 0,
    filtered: 0,
    ignored: 0,
    skippedDuplicates: 0,
    skippedMalformed: 0,
    errors: 0,
    lastTimestamp,
    durationMs: 0,
    createdSecurityEventIds: [],
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
        data: { lastError: message.slice(0, 500) },
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

/**
 * Controlled Wazuh → Security Events sync (manual or scheduled).
 * Does NOT import historical alerts older than the checkpoint when continuing from it.
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
      },
    });

    const result = emptyResult(state.lastTimestamp);

    if (input.continueFromCheckpoint && !state.lastTimestamp) {
      throw new Error(
        "Ingestion is not initialized. Run Initialize From Now before syncing."
      );
    }

    let afterTimestamp =
      input.continueFromCheckpoint && state.lastTimestamp
        ? state.lastTimestamp
        : initialCursorForMode(input.mode);

    if (
      input.mode === "FROM_NOW" &&
      !state.lastTimestamp &&
      !input.continueFromCheckpoint
    ) {
      await prisma.wazuhIngestionState.update({
        where: { organizationId },
        data: {
          lastTimestamp: afterTimestamp,
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

    if (input.continueFromCheckpoint && state.lastTimestamp) {
      afterTimestamp = state.lastTimestamp;
    }

    // Snapshot checkpoint for skip comparisons — never move backwards.
    const checkpointSnapshot = state.lastTimestamp;

    const mappings = await prisma.wazuhAgentMapping.findMany({
      where: { organizationId },
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
    while (hasMore) {
      const page = await searchWazuhAlerts({
        afterTimestamp,
        size: WAZUH_INGESTION_BATCH_SIZE,
      });

      if (page.hits.length === 0) {
        hasMore = false;
        break;
      }

      for (const hit of page.hits) {
        result.processed++;
        try {
          const existing = await prisma.wazuhProcessedAlert.findUnique({
            where: {
              organizationId_documentId: {
                organizationId,
                documentId: hit._id,
              },
            },
          });
          if (existing) {
            result.skippedDuplicates++;
            const ts = hit._source?.timestamp
              ? new Date(String(hit._source.timestamp))
              : null;
            if (ts && !Number.isNaN(ts.getTime())) {
              afterTimestamp = ts;
              if (
                !result.lastTimestamp ||
                ts.getTime() > result.lastTimestamp.getTime()
              ) {
                result.lastTimestamp = ts;
                await prisma.wazuhIngestionState.update({
                  where: { organizationId },
                  data: {
                    lastTimestamp: ts,
                    lastDocumentId: hit._id,
                  },
                });
              }
            }
            continue;
          }

          const normalized = normalizeWazuhAlertHit({
            _id: hit._id,
            _source: hit._source,
          });
          if (!normalized) {
            result.skippedMalformed++;
            await prisma.wazuhProcessedAlert.create({
              data: {
                organizationId,
                documentId: hit._id,
                disposition: "MALFORMED",
                filterReason: "Failed normalization",
              },
            });
            const ts = hit._source?.timestamp
              ? new Date(String(hit._source.timestamp))
              : null;
            if (ts && !Number.isNaN(ts.getTime())) {
              afterTimestamp = ts;
              result.lastTimestamp = ts;
              await prisma.wazuhIngestionState.update({
                where: { organizationId },
                data: {
                  lastTimestamp: ts,
                  lastDocumentId: hit._id,
                },
              });
            }
            continue;
          }

          if (
            input.continueFromCheckpoint &&
            checkpointSnapshot &&
            normalized.timestamp.getTime() <= checkpointSnapshot.getTime()
          ) {
            result.skippedDuplicates++;
            await prisma.wazuhProcessedAlert.create({
              data: {
                organizationId,
                documentId: normalized.documentId,
                alertTimestamp: normalized.timestamp,
                disposition: "DUPLICATE",
                filterReason: "At or before checkpoint",
              },
            });
            continue;
          }

          // Always advance cursor for a successfully normalized document
          // before optional SecurityEvent creation (idempotent ledger first).
          const policy = evaluateWazuhIngestionPolicy(normalized);
          if (policy.action === "FILTER") {
            await prisma.wazuhProcessedAlert.create({
              data: {
                organizationId,
                documentId: normalized.documentId,
                alertTimestamp: normalized.timestamp,
                disposition: policy.disposition,
                filterReason: policy.reason.slice(0, 500),
              },
            });
            result.filtered++;
            afterTimestamp = normalized.timestamp;
            result.lastTimestamp = normalized.timestamp;
            await prisma.wazuhIngestionState.update({
              where: { organizationId },
              data: {
                lastTimestamp: normalized.timestamp,
                lastDocumentId: normalized.documentId,
              },
            });
            continue;
          }

          const classification = classifyWazuhAlert(normalized);
          // IGNORED classification still creates a SecurityEvent (visible + filterable).
          if (classification === "IGNORED") {
            result.ignored++;
          }

          const mapping = normalized.agentId
            ? mappingByAgent.get(normalized.agentId)
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
            organizationId,
            assetId,
            alert: normalized,
          });

          const alertIsSca = isScaAlert(normalized);
          const windowMs = correlationWindowMs(alertIsSca);
          const windowLabel = correlationWindowLabel(alertIsSca);

          const openEvent = await prisma.securityEvent.findFirst({
            where: {
              organizationId,
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
              organizationId,
              assetId,
              alert: normalized,
              occurrenceCount: nextCount,
              windowLabel,
            });
            const updated = await prisma.securityEvent.update({
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
            result.updated++;
            disposition = "EVENT_CORRELATED";
            await recordOrUpdateCorrelatedOccurrence({
              organizationId,
              securityEventId,
              occurrenceCount: updated.occurrenceCount,
              correlationSummary,
            });
          } else {
            const correlationSummary = buildCorrelationSummary({
              organizationId,
              assetId,
              alert: normalized,
              occurrenceCount: 1,
              windowLabel,
            });
            const created = await prisma.securityEvent.create({
              data: {
                organizationId,
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
            result.created++;
            result.createdSecurityEventIds.push(created.id);
            disposition = "EVENT_CREATED";
            await recordSecurityEventActivity({
              organizationId,
              securityEventId,
              activityType: "CREATED",
              message: `Security event created from Wazuh alert (${normalized.ruleId ?? "unknown rule"}).`,
              metadata: {
                documentId: normalized.documentId,
                ruleId: normalized.ruleId,
              },
            });
          }

          await prisma.wazuhProcessedAlert.create({
            data: {
              organizationId,
              documentId: normalized.documentId,
              securityEventId,
              alertTimestamp: normalized.timestamp,
              disposition,
            },
          });

          afterTimestamp = normalized.timestamp;
          result.lastTimestamp = normalized.timestamp;

          await prisma.wazuhIngestionState.update({
            where: { organizationId },
            data: {
              lastTimestamp: normalized.timestamp,
              lastDocumentId: normalized.documentId,
            },
          });
        } catch {
          result.errors++;
          hasMore = false;
          break;
        }
      }

      if (page.hits.length < WAZUH_INGESTION_BATCH_SIZE) {
        hasMore = false;
      }
    }

    result.durationMs = Date.now() - startedAt;

    await prisma.wazuhIngestionState.update({
      where: { organizationId },
      data: {
        lastSuccessfulSyncAt: new Date(),
        lastError:
          result.errors > 0
            ? `Completed with ${result.errors} processing error(s)`
            : null,
        lastSyncDurationMs: result.durationMs,
        lastSyncProcessed: result.processed,
        lastSyncCreated: result.created,
        lastSyncUpdated: result.updated,
        lastSyncFiltered: result.filtered,
        lastSyncIgnored: result.ignored,
        lastSyncSkippedDuplicates: result.skippedDuplicates,
        lastSyncErrors: result.errors,
      },
    });

    await createAuditLog({
      organizationId,
      actorId: input.actorId,
      action: "WAZUH_SYNC_COMPLETED",
      resourceType: "WazuhIngestion",
      resourceId: state.id,
      metadata: {
        mode: input.mode,
        processed: result.processed,
        created: result.created,
        updated: result.updated,
        filtered: result.filtered,
        ignored: result.ignored,
        skippedDuplicates: result.skippedDuplicates,
        skippedMalformed: result.skippedMalformed,
        errors: result.errors,
        durationMs: result.durationMs,
        lastTimestamp: result.lastTimestamp?.toISOString() ?? null,
      },
    });

    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Wazuh sync failed";
    await prisma.wazuhIngestionState.update({
      where: { organizationId },
      data: { lastError: message.slice(0, 500) },
    });
    await createAuditLog({
      organizationId,
      actorId: input.actorId,
      action: "WAZUH_SYNC_FAILED",
      resourceType: "WazuhIngestion",
      resourceId: state.id,
      metadata: { mode: input.mode, error: message.slice(0, 200) },
    });
    throw error;
  } finally {
    await releaseWazuhIngestionDbLock({ organizationId, lockedBy });
  }
}
