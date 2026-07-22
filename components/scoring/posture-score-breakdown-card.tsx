"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  SCORE_DISCLAIMER,
  SCORE_LABEL,
  type AssetPostureScoreResult,
} from "@/types/scoring";

interface PostureScoreBreakdownCardProps {
  posture: AssetPostureScoreResult;
  /** Optional passive check score shown separately */
  passiveScore?: number | null;
}

export function PostureScoreBreakdownCard({
  posture,
  passiveScore,
}: PostureScoreBreakdownCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{SCORE_LABEL}</CardTitle>
        <CardDescription>
          {posture.assessed
            ? `Assessment Coverage: ${posture.coverage ?? "—"}`
            : "Not Assessed"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-3xl font-semibold tabular-nums text-foreground">
          {posture.displayScore != null ? `${posture.displayScore}/100` : "—"}
        </p>
        <p className="text-xs text-muted" title={SCORE_DISCLAIMER}>
          {SCORE_DISCLAIMER}
        </p>
        {passiveScore != null && (
          <p className="text-xs text-muted">
            Passive check score (separate): {passiveScore}/100
          </p>
        )}
        {posture.assessed && (
          <div className="space-y-1 border-t border-border pt-3">
            <p className="text-sm font-medium text-foreground">Breakdown</p>
            <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-muted">
              {posture.breakdown.map((line, i) => (
                <li key={`${line.label}-${i}`}>
                  <span className="text-foreground">{line.label}</span>
                  {line.amount !== 0 && (
                    <span className="tabular-nums">
                      {" "}
                      {line.amount > 0 ? "+" : ""}
                      {line.amount.toFixed(2)}
                    </span>
                  )}
                  {line.detail && (
                    <span className="block text-[11px] opacity-80">
                      {line.detail}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted">Open</dt>
                <dd className="font-medium">{posture.openFindings}</dd>
              </div>
              <div>
                <dt className="text-muted">Validated</dt>
                <dd className="font-medium">{posture.validatedFindings}</dd>
              </div>
              <div>
                <dt className="text-muted">Accepted</dt>
                <dd className="font-medium">{posture.acceptedRisks}</dd>
              </div>
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
