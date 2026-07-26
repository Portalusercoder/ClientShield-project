/**
 * Deterministic Wazuh ingestion cursor helpers.
 * Sort order matches Indexer search: timestamp asc, _id asc.
 */

export interface WazuhCheckpointCursor {
  timestamp: Date | null;
  documentId: string | null;
}

/**
 * Returns true when `next` is strictly after `current` in (timestamp, documentId) order.
 * Used to ensure checkpoints never move backwards.
 */
export function isWazuhCheckpointForward(
  current: WazuhCheckpointCursor,
  next: { timestamp: Date; documentId: string }
): boolean {
  if (!current.timestamp) return true;
  const currentMs = current.timestamp.getTime();
  const nextMs = next.timestamp.getTime();
  if (nextMs > currentMs) return true;
  if (nextMs < currentMs) return false;
  // Same timestamp: lexicographic document id (matches ES/_id asc).
  if (!current.documentId) return true;
  return next.documentId > current.documentId;
}

/**
 * Build Indexer search body for forward-only resume.
 *
 * - Both timestamp + documentId → search_after (handles same-timestamp collisions).
 * - Timestamp only (post-initialize) → exclusive range gt (do not re-import checkpoint tip).
 * - Neither → match_all from the beginning (legacy window modes).
 */
export function buildWazuhAlertsSearchBody(input: {
  afterTimestamp?: Date | null;
  afterDocumentId?: string | null;
  size: number;
}): Record<string, unknown> {
  const sort = [{ timestamp: "asc" as const }, { _id: "asc" as const }];
  const size = input.size;

  if (input.afterTimestamp && input.afterDocumentId) {
    return {
      size,
      sort,
      query: { match_all: {} },
      search_after: [
        input.afterTimestamp.toISOString(),
        input.afterDocumentId,
      ],
      _source: true,
    };
  }

  const must: Record<string, unknown>[] = [];
  if (input.afterTimestamp) {
    must.push({
      range: {
        timestamp: {
          gt: input.afterTimestamp.toISOString(),
        },
      },
    });
  }

  return {
    size,
    sort,
    query: must.length ? { bool: { must } } : { match_all: {} },
    _source: true,
  };
}
