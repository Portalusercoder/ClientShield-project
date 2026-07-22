/**
 * Centralized Wazuh rule-level → SecurityEvent severity mapping.
 * Wazuh rule levels are typically 0–15.
 */
import type { SecurityEventSeverity } from "@prisma/client";

export function mapWazuhRuleLevelToSeverity(
  level: number | null | undefined
): SecurityEventSeverity {
  const n = typeof level === "number" && Number.isFinite(level) ? level : 0;
  if (n >= 13) return "CRITICAL";
  if (n >= 10) return "HIGH";
  if (n >= 7) return "MEDIUM";
  if (n >= 4) return "LOW";
  return "INFO";
}

/** Default correlation window for deduplicating related alerts. */
export const WAZUH_CORRELATION_WINDOW_MS = 15 * 60 * 1000;

/** Longer default window for SCA/CIS observation noise. */
export const WAZUH_SCA_CORRELATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Max alerts processed per sync batch. */
export const WAZUH_INGESTION_BATCH_SIZE = 100;

/** Asset types eligible for Wazuh endpoint agent mapping. */
export const WAZUH_MAPPABLE_ASSET_TYPES = [
  "SERVER",
  "WORKSTATION",
  "NETWORK_DEVICE",
  "IOT_DEVICE",
  "OTHER",
] as const;

export type WazuhMappableAssetType =
  (typeof WAZUH_MAPPABLE_ASSET_TYPES)[number];

export function isWazuhMappableAssetType(
  type: string
): type is WazuhMappableAssetType {
  return (WAZUH_MAPPABLE_ASSET_TYPES as readonly string[]).includes(type);
}

/** Heartbeat considered stale after this many ms without touch. */
export const WAZUH_WORKER_STALE_MS = 3 * 60 * 1000;
