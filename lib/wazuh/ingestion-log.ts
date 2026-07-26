/**
 * Structured, non-sensitive ingestion logs (Phase 6P2 → central logger).
 * Never log secrets, tokens, passwords, or full alert payloads.
 */
import { logger } from "@/lib/observability/logger";

export type WazuhIngestionLogLevel = "info" | "warn" | "error";

export function logWazuhIngestion(
  level: WazuhIngestionLogLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  const fields = { service: "wazuh-ingestion", ...meta };
  if (level === "info") logger.info(message, fields);
  else if (level === "warn") logger.warn(message, fields);
  else logger.error(message, fields);
}
