/**
 * ClientShield-side Wazuh alert classification.
 * Does not modify Wazuh rules/decoders — classification happens at ingestion.
 */
import type { SecurityEventClassification } from "@prisma/client";
import type { NormalizedWazuhAlert } from "@/services/wazuh/wazuh-normalizer.service";

/** Known high-volume CIS/SCA observation rules observed in local E2E. */
export const SCA_NOISY_RULE_IDS = new Set(["19007", "19008", "19009"]);

/** Rules that are typically informational endpoint hygiene signals. */
const INFORMATIONAL_RULE_IDS = new Set([
  "501", // new agent connected
  "502",
  "503",
  "504",
  "89602", // screen unlock
  "89603", // screen lock
]);

export function isScaAlert(alert: NormalizedWazuhAlert): boolean {
  if (alert.scaCheckId) return true;
  const groups = alert.ruleGroups.map((g) => g.toLowerCase());
  if (groups.some((g) => g.includes("sca") || g.includes("cis"))) return true;
  if (alert.ruleId && SCA_NOISY_RULE_IDS.has(alert.ruleId)) return true;
  const desc = (alert.ruleDescription ?? "").toLowerCase();
  return desc.includes("cis_") || desc.startsWith("sca ");
}

/**
 * Conservative classification defaults.
 * High-severity alerts are never IGNORED by default.
 */
export function classifyWazuhAlert(
  alert: NormalizedWazuhAlert
): SecurityEventClassification {
  const level = alert.ruleLevel ?? 0;

  if (level >= 10) return "ACTIONABLE";

  if (alert.ruleId && SCA_NOISY_RULE_IDS.has(alert.ruleId)) {
    return "NOISY";
  }

  if (isScaAlert(alert)) {
    return level >= 7 ? "ACTIONABLE" : "NOISY";
  }

  if (alert.ruleId && INFORMATIONAL_RULE_IDS.has(alert.ruleId)) {
    return "INFORMATIONAL";
  }

  const groups = alert.ruleGroups.map((g) => g.toLowerCase());
  if (groups.includes("recon") || groups.includes("firewall")) {
    return level >= 5 ? "ACTIONABLE" : "INFORMATIONAL";
  }

  if (level >= 7) return "ACTIONABLE";
  if (level >= 4) return "INFORMATIONAL";
  return "INFORMATIONAL";
}
