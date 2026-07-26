/**
 * Categorize Wazuh ingestion failures for safe recovery decisions.
 * Never include secrets or raw payloads in messages.
 */

export type WazuhIngestionErrorCategory =
  | "INDEXER_UNAVAILABLE"
  | "INDEXER_TIMEOUT"
  | "MALFORMED_PAYLOAD"
  | "DATABASE_FAILURE"
  | "CHECKPOINT_FAILURE"
  | "DUPLICATE"
  | "LOCK_LOST"
  | "TRANSIENT"
  | "UNKNOWN";

export function categorizeWazuhIngestionError(
  error: unknown
): WazuhIngestionErrorCategory {
  if (!error) return "UNKNOWN";

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  // Prisma unique violation — already processed.
  if (code === "P2002") return "DUPLICATE";

  const message =
    error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("sync is already in progress") ||
    lower.includes("lock lost") ||
    lower.includes("ingestion lock")
  ) {
    return "LOCK_LOST";
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return "INDEXER_TIMEOUT";
  }
  if (
    lower.includes("indexer unreachable") ||
    lower.includes("indexer request failed") ||
    lower.includes("indexer unavailable") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound")
  ) {
    return "INDEXER_UNAVAILABLE";
  }
  if (
    lower.includes("malformed") ||
    lower.includes("failed normalization")
  ) {
    return "MALFORMED_PAYLOAD";
  }
  if (lower.includes("checkpoint")) {
    return "CHECKPOINT_FAILURE";
  }
  if (
    code.startsWith("P1") ||
    lower.includes("prisma") ||
    lower.includes("database") ||
    lower.includes("connection pool") ||
    lower.includes("could not connect")
  ) {
    // P1001 etc. + generic DB wording
    if (
      code === "P1001" ||
      code === "P1002" ||
      code === "P1008" ||
      code === "P1017" ||
      lower.includes("connection pool") ||
      lower.includes("timed out fetching") ||
      lower.includes("can't reach database")
    ) {
      return "TRANSIENT";
    }
    return "DATABASE_FAILURE";
  }
  return "UNKNOWN";
}

/** Soft-retry once for transient DB / timeout categories. */
export function isRetriableWazuhIngestionError(
  category: WazuhIngestionErrorCategory
): boolean {
  return category === "TRANSIENT" || category === "INDEXER_TIMEOUT";
}

/** Abort remaining page fetches (indexer / lock / hard DB). */
export function shouldAbortWazuhSyncPageLoop(
  category: WazuhIngestionErrorCategory
): boolean {
  return (
    category === "INDEXER_UNAVAILABLE" ||
    category === "INDEXER_TIMEOUT" ||
    category === "LOCK_LOST" ||
    category === "CHECKPOINT_FAILURE" ||
    category === "DATABASE_FAILURE"
  );
}
