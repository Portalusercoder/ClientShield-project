import { createHash } from "node:crypto";
import type { NormalizedWazuhAlert } from "@/services/wazuh/wazuh-normalizer.service";
import { isScaAlert } from "@/services/wazuh/wazuh-classification.service";

export interface CorrelationDimensions {
  organizationId: string;
  assetOrAgent: string;
  ruleId: string;
  scaCheckId: string | null;
  sourceIdentity: string | null;
  destinationIdentity: string | null;
  isSca: boolean;
  windowLabel: string;
}

/**
 * Build a stable correlation key for deduplicating related Wazuh alerts.
 *
 * Dimensions:
 * - organization (caller scopes storage)
 * - mapped asset id OR agent id OR "unmapped"
 * - rule id
 * - SCA check id when present (aggressive SCA aggregation)
 * - source identity (IP or agent) — omitted for SCA (noise)
 * - destination identity — omitted for SCA
 */
export function buildCorrelationDimensions(input: {
  organizationId: string;
  assetId: string | null;
  alert: NormalizedWazuhAlert;
  windowLabel?: string;
}): CorrelationDimensions {
  const assetOrAgent = input.assetId ?? input.alert.agentId ?? "unmapped";
  const ruleId = input.alert.ruleId ?? "unknown-rule";
  const isSca = isScaAlert(input.alert);
  const scaCheckId = isSca ? input.alert.scaCheckId ?? "sca" : null;
  const sourceIdentity = isSca
    ? null
    : input.alert.sourceIp ?? input.alert.agentId ?? "unknown-src";
  const destinationIdentity = isSca
    ? null
    : input.alert.destinationIp ?? "-";

  return {
    organizationId: input.organizationId,
    assetOrAgent,
    ruleId,
    scaCheckId,
    sourceIdentity,
    destinationIdentity,
    isSca,
    windowLabel:
      input.windowLabel ?? (isSca ? "24 hours" : "15 minutes"),
  };
}

export function buildCorrelationKey(input: {
  organizationId: string;
  assetId: string | null;
  alert: NormalizedWazuhAlert;
}): string {
  const d = buildCorrelationDimensions(input);
  const parts = [d.organizationId, d.assetOrAgent, d.ruleId];
  if (d.isSca) {
    parts.push(d.scaCheckId ?? "sca");
  } else {
    parts.push(d.sourceIdentity ?? "unknown-src", d.destinationIdentity ?? "-");
  }
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 48);
}

/**
 * Analyst-facing explanation — never lead with the internal hash.
 */
export function buildCorrelationSummary(input: {
  organizationId: string;
  assetId: string | null;
  alert: NormalizedWazuhAlert;
  occurrenceCount: number;
  windowLabel?: string;
}): string {
  const d = buildCorrelationDimensions({
    organizationId: input.organizationId,
    assetId: input.assetId,
    alert: input.alert,
    windowLabel: input.windowLabel,
  });

  const matchParts: string[] = [];
  if (input.alert.agentId || input.alert.agentName) {
    matchParts.push(
      `Agent ${input.alert.agentId ?? ""}${
        input.alert.agentName ? ` (${input.alert.agentName})` : ""
      }`.trim()
    );
  } else if (input.assetId) {
    matchParts.push(`Asset ${input.assetId}`);
  } else {
    matchParts.push("Unmapped host");
  }

  matchParts.push(`Rule ${d.ruleId}`);

  if (d.isSca && d.scaCheckId && d.scaCheckId !== "sca") {
    matchParts.push(`SCA Check ${d.scaCheckId}`);
  } else if (!d.isSca) {
    if (d.sourceIdentity && d.sourceIdentity !== "unknown-src") {
      matchParts.push(`Source ${d.sourceIdentity}`);
    }
    if (d.destinationIdentity && d.destinationIdentity !== "-") {
      matchParts.push(`Destination ${d.destinationIdentity}`);
    }
  }

  const n = Math.max(1, input.occurrenceCount);
  return `${n} Wazuh alert${n === 1 ? "" : "s"} correlated because they matched: ${matchParts.join(" + ")} within ${d.windowLabel}.`;
}

export function isWithinCorrelationWindow(
  lastSeenAt: Date,
  alertTimestamp: Date,
  windowMs: number
): boolean {
  return (
    Math.abs(alertTimestamp.getTime() - lastSeenAt.getTime()) <= windowMs
  );
}
