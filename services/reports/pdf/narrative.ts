import type { SecurityPostureReportSnapshot } from "@/types/reports";

/**
 * Deterministic posture overview from snapshot values — no unsupported claims.
 */
export function buildPostureOverview(
  snapshot: SecurityPostureReportSnapshot
): string {
  const score = snapshot.postureDetail.score;
  const coverage =
    snapshot.assets[0]?.coverage ??
    snapshot.postureDetail.coverage ??
    "Not Assessed";
  const v = snapshot.findingSummary.validatedBySeverity;
  const validatedCriticalHigh = v.critical + v.high;
  const open = snapshot.executiveSummary.openObservations;
  const ar = snapshot.executiveSummary.acceptedRisks;
  const assessed = snapshot.executiveSummary.posture.assetsAssessed;
  const total = snapshot.executiveSummary.posture.assetsTotal;

  const scorePart =
    score == null
      ? "has not yet received a ClientShield Security Posture Score"
      : `currently has a ClientShield Security Posture Score of ${score}/100`;

  const coveragePart =
    score == null
      ? ""
      : ` with ${typeof coverage === "string" && coverage.includes("%") ? coverage : `${coverage} assessment coverage`}`;

  const validatedPart =
    validatedCriticalHigh === 0
      ? "No analyst-validated Critical or High findings were identified during the reporting period"
      : `${validatedCriticalHigh} analyst-validated Critical/High finding(s) were identified during the reporting period`;

  const openPart =
    open === 0
      ? "no scanner observations remain pending analyst review"
      : `${open} scanner observation${open === 1 ? "" : "s"} remain pending analyst review`;

  const arPart =
    ar === 0
      ? "no risks have been formally accepted"
      : `${ar} risk${ar === 1 ? " has" : "s have"} been formally accepted`;

  return `The assessed environment (${assessed} of ${total} assets assessed) ${scorePart}${coveragePart}. ${validatedPart}. ${capitalize(openPart)}, and ${arPart}. Scanner observations are automated detections and are distinct from analyst-validated findings.`;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Prepare score-trend points for charting: keep chronological order,
 * collapse near-identical timestamps into readable series without inventing dates.
 */
export function prepareTrendPoints(
  points: Array<{ date: string; score: number; coverage: string | null }>,
  maxPoints = 24
): Array<{ date: string; score: number; coverage: string | null; label: string }> {
  if (points.length === 0) return [];

  const sorted = [...points].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Keep first, last, and evenly sampled middle when dense
  let sampled = sorted;
  if (sorted.length > maxPoints) {
    const out: typeof sorted = [];
    const step = (sorted.length - 1) / (maxPoints - 1);
    for (let i = 0; i < maxPoints; i++) {
      out.push(sorted[Math.round(i * step)]!);
    }
    sampled = out;
  }

  const sameDay = sampled.every(
    (p) =>
      new Date(p.date).toDateString() ===
      new Date(sampled[0]!.date).toDateString()
  );

  return sampled.map((p) => ({
    ...p,
    label: sameDay
      ? new Date(p.date).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      : new Date(p.date).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        }),
  }));
}
