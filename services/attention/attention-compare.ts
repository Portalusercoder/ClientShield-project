import type { AttentionSourceType } from "@prisma/client";
import { attentionOwnershipMode } from "@/lib/ownership/model";
import { buildEligibilityGeneration } from "@/services/attention/eligibility-generation";
import type { AttentionItem, AttentionSeverity } from "@/types/attention";
import type { SlaState } from "@/types/sla";

export function severityRank(severity: AttentionSeverity): number {
  return severity === "CRITICAL" ? 100 : 50;
}

export function itemKey(sourceType: AttentionSourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

export function normalizeReasons(reasons: string[]): string[] {
  return [...new Set(reasons.map((r) => r.trim()).filter(Boolean))];
}

export function overlayDefaults(input: {
  sourceType: AttentionSourceType;
  sourceId: string;
  anchorAt: Date;
  assignedToUserId: string | null;
  assignedToName: string | null;
}): Pick<
  AttentionItem,
  | "eligibilityGeneration"
  | "ownershipMode"
  | "acknowledged"
  | "acknowledgedAt"
  | "acknowledgedByUserId"
  | "acknowledgedByName"
  | "claimedByUserId"
  | "claimedByName"
  | "claimedAt"
  | "isClaimed"
  | "assignedToUserId"
  | "assignedToName"
  | "isAssigned"
  | "ownerUserId"
  | "ownerName"
  | "isMine"
  | "assigneeId"
  | "assigneeName"
  | "isSnoozedForCurrentUser"
  | "snoozedUntil"
  | "slaState"
  | "slaMetric"
  | "slaTargetMinutes"
  | "slaElapsedMinutes"
  | "slaRemainingMinutes"
  | "slaDueAt"
> {
  const mode = attentionOwnershipMode(input.sourceType);
  const isAssigned = Boolean(input.assignedToUserId);
  // Before overlay enrich: Finding/Incident treat assign as claim; SE/Inv start unclaimed.
  const isClaimed = mode === "NATIVE_ASSIGN" ? isAssigned : false;
  const ownerUserId =
    mode === "NATIVE_ASSIGN" ? input.assignedToUserId : null;
  const ownerName = mode === "NATIVE_ASSIGN" ? input.assignedToName : null;
  return {
    eligibilityGeneration: buildEligibilityGeneration({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      anchorAt: input.anchorAt,
    }),
    ownershipMode: mode,
    acknowledged: false,
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    acknowledgedByName: null,
    claimedByUserId: null,
    claimedByName: null,
    claimedAt: null,
    isClaimed,
    assignedToUserId: input.assignedToUserId,
    assignedToName: input.assignedToName,
    isAssigned,
    ownerUserId,
    ownerName,
    isMine: false,
    assigneeId: ownerUserId,
    assigneeName: ownerName,
    isSnoozedForCurrentUser: false,
    snoozedUntil: null,
    slaState: "NO_POLICY",
    slaMetric: null,
    slaTargetMinutes: null,
    slaElapsedMinutes: null,
    slaRemainingMinutes: null,
    slaDueAt: null,
  };
}

export function slaPriority(state: SlaState): number {
  if (state === "BREACHED") return 2;
  if (state === "APPROACHING") return 1;
  return 0;
}

export function compareAttentionItems(a: AttentionItem, b: AttentionItem): number {
  const slaA = slaPriority(a.slaState);
  const slaB = slaPriority(b.slaState);
  if (slaA !== slaB) return slaB - slaA;
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  if (a.severityRank !== b.severityRank) return b.severityRank - a.severityRank;
  if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
  const ta = a.waitingSince.getTime();
  const tb = b.waitingSince.getTime();
  if (ta !== tb) return ta - tb;
  return a.key.localeCompare(b.key);
}
