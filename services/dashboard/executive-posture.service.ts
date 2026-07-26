/**
 * Transparent executive security posture score (Phase 6C2).
 * Pure function — deductions from operational counts only (not asset scan scores).
 */
import type {
  ExecutiveGrade,
  ExecutivePostureScore,
  ExecutivePostureWeights,
} from "@/types/executive-dashboard";

export const EXECUTIVE_POSTURE_WEIGHTS: ExecutivePostureWeights = {
  criticalIncidentPer: 12,
  criticalIncidentCap: 48,
  criticalFindingPer: 6,
  criticalFindingCap: 36,
  breachedSlaPer: 15,
  breachedSlaCap: 45,
  openInvestigationPer: 3,
  openInvestigationCap: 24,
  openSecurityEventPer: 0.5,
  openSecurityEventCap: 20,
};

function capped(count: number, per: number, cap: number): number {
  return Math.min(cap, Math.max(0, count) * per);
}

export function gradeFromScore(score: number): ExecutiveGrade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/**
 * Score = 100 − capped weighted deductions from open risk signals.
 * Returns score + grade (A–F) with full factor transparency.
 */
export function calculateExecutivePostureScore(input: {
  criticalIncidents: number;
  criticalFindings: number;
  breachedSla: number;
  openInvestigations: number;
  openSecurityEvents: number;
  weights?: ExecutivePostureWeights;
}): ExecutivePostureScore {
  const weights = input.weights ?? EXECUTIVE_POSTURE_WEIGHTS;

  const deductions = {
    criticalIncidents: capped(
      input.criticalIncidents,
      weights.criticalIncidentPer,
      weights.criticalIncidentCap
    ),
    criticalFindings: capped(
      input.criticalFindings,
      weights.criticalFindingPer,
      weights.criticalFindingCap
    ),
    breachedSla: capped(
      input.breachedSla,
      weights.breachedSlaPer,
      weights.breachedSlaCap
    ),
    openInvestigations: capped(
      input.openInvestigations,
      weights.openInvestigationPer,
      weights.openInvestigationCap
    ),
    openSecurityEvents: capped(
      input.openSecurityEvents,
      weights.openSecurityEventPer,
      weights.openSecurityEventCap
    ),
    total: 0,
  };
  deductions.total =
    deductions.criticalIncidents +
    deductions.criticalFindings +
    deductions.breachedSla +
    deductions.openInvestigations +
    deductions.openSecurityEvents;

  const raw = Math.max(0, Math.min(100, 100 - deductions.total));
  const score = Math.round(raw * 10) / 10;

  return {
    score,
    grade: gradeFromScore(score),
    factors: {
      criticalIncidents: input.criticalIncidents,
      criticalFindings: input.criticalFindings,
      breachedSla: input.breachedSla,
      openInvestigations: input.openInvestigations,
      openSecurityEvents: input.openSecurityEvents,
    },
    deductions,
    weights,
  };
}
