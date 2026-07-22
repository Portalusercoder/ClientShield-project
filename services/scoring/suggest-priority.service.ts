import type {
  AssetCriticality,
  FindingSeverity,
  FindingStatus,
  TriagePriority,
} from "@prisma/client";

const SEVERITY_TO_PRIORITY: Record<FindingSeverity, TriagePriority> = {
  CRITICAL: "P1_CRITICAL",
  HIGH: "P2_HIGH",
  MEDIUM: "P3_MEDIUM",
  LOW: "P4_LOW",
  INFO: "P5_INFORMATIONAL",
};

const PRIORITY_ORDER: TriagePriority[] = [
  "P1_CRITICAL",
  "P2_HIGH",
  "P3_MEDIUM",
  "P4_LOW",
  "P5_INFORMATIONAL",
];

function bumpPriority(p: TriagePriority, steps: number): TriagePriority {
  const idx = PRIORITY_ORDER.indexOf(p);
  return PRIORITY_ORDER[Math.max(0, idx - steps)] ?? p;
}

/**
 * Suggested triage priority — recommendation only.
 * Never auto-persists P1 without analyst confirmation.
 */
export function suggestTriagePriority(input: {
  severity: FindingSeverity;
  assetCriticality: AssetCriticality;
  status: FindingStatus;
}): TriagePriority {
  let suggested = SEVERITY_TO_PRIORITY[input.severity];

  if (
    input.assetCriticality === "CRITICAL" ||
    input.assetCriticality === "HIGH"
  ) {
    suggested = bumpPriority(suggested, 1);
  }

  // Unvalidated OPEN findings: do not suggest higher urgency than severity baseline bump
  // (still may show P1 as recommendation for CRITICAL+critical asset — analyst must confirm).
  void input.status;

  return suggested;
}
