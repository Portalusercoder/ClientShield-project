/**
 * Configurable ClientShield-side Wazuh ingestion policy (env-backed).
 */
import { serverEnv } from "@/lib/env";
import type { NormalizedWazuhAlert } from "@/services/wazuh/wazuh-normalizer.service";
import type { WazuhProcessedDisposition } from "@prisma/client";

export type WazuhFilterDecision =
  | { action: "CREATE_EVENT" }
  | {
      action: "FILTER";
      disposition: Extract<
        WazuhProcessedDisposition,
        "FILTERED_LEVEL" | "FILTERED_DENYLIST" | "FILTERED_ALLOWLIST"
      >;
      reason: string;
    };

function parseRuleIdList(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function getWazuhIngestionPolicy() {
  return {
    minEventLevel: serverEnv.WAZUH_MIN_EVENT_LEVEL,
    allowlist: parseRuleIdList(serverEnv.WAZUH_RULE_ALLOWLIST),
    denylist: parseRuleIdList(serverEnv.WAZUH_RULE_DENYLIST),
  };
}

/**
 * Decide whether a normalized alert should create/update a SecurityEvent.
 * Filtered alerts must still be ledgered and advance the checkpoint.
 */
export function evaluateWazuhIngestionPolicy(
  alert: NormalizedWazuhAlert
): WazuhFilterDecision {
  const policy = getWazuhIngestionPolicy();
  const ruleId = alert.ruleId ?? "";

  if (ruleId && policy.denylist.has(ruleId)) {
    return {
      action: "FILTER",
      disposition: "FILTERED_DENYLIST",
      reason: `Rule ${ruleId} is denylisted`,
    };
  }

  if (policy.allowlist.size > 0 && (!ruleId || !policy.allowlist.has(ruleId))) {
    return {
      action: "FILTER",
      disposition: "FILTERED_ALLOWLIST",
      reason: ruleId
        ? `Rule ${ruleId} not in allowlist`
        : "Alert has no rule id and allowlist is active",
    };
  }

  const level = alert.ruleLevel ?? 0;
  if (level < policy.minEventLevel) {
    return {
      action: "FILTER",
      disposition: "FILTERED_LEVEL",
      reason: `Rule level ${level} below minimum ${policy.minEventLevel}`,
    };
  }

  return { action: "CREATE_EVENT" };
}
