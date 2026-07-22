import type { AssessmentCoverage, AssetCriticality } from "@prisma/client";

export const SCORE_LABEL = "ClientShield Security Posture Score";

export const SCORE_DISCLAIMER =
  "This score reflects findings detected by ClientShield's configured checks. It does not guarantee that the asset is free from vulnerabilities.";

export interface ScoreBreakdownLine {
  label: string;
  amount: number;
  detail?: string;
}

export interface AssetPostureScoreResult {
  /** null when asset has never been assessed */
  score: number | null;
  displayScore: number | null;
  coverage: AssessmentCoverage | null;
  assessed: boolean;
  baseScore: number;
  totalDeduction: number;
  breakdown: ScoreBreakdownLine[];
  lastAssessedAt: Date | null;
  openFindings: number;
  validatedFindings: number;
  acceptedRisks: number;
  disclaimer: string;
}

export interface ClientPostureScoreResult {
  score: number | null;
  displayScore: number | null;
  assessedAssets: number;
  totalAssets: number;
  coveragePercent: number | null;
  criticalAssets: number;
  openFindings: number;
  validatedFindings: number;
  acceptedRisks: number;
  assetScores: Array<{
    assetId: string;
    assetName: string;
    criticality: AssetCriticality;
    score: number | null;
    weight: number;
  }>;
  disclaimer: string;
}

export interface OrganizationPostureScoreResult {
  averageScore: number | null;
  assetsAssessed: number;
  assetsTotal: number;
  disclaimer: string;
}
