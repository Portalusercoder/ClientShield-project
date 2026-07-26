/**
 * Structured, non-sensitive ingestion logs.
 * Never log secrets, tokens, passwords, or full alert payloads.
 */

export type WazuhIngestionLogLevel = "info" | "warn" | "error";

export function logWazuhIngestion(
  level: WazuhIngestionLogLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    service: "wazuh-ingestion",
    message,
    ...(meta ?? {}),
  };
  if (level === "info") {
    console.log(JSON.stringify(line));
  } else if (level === "warn") {
    console.warn(JSON.stringify(line));
  } else {
    console.error(JSON.stringify(line));
  }
}
