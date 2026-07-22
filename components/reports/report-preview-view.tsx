import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReportArchiveButton } from "@/components/reports/report-archive-button";
import { formatDate } from "@/lib/utils";
import { buildPostureOverview, prepareTrendPoints } from "@/services/reports/pdf/narrative";
import type {
  ReportFindingCounts,
  SecurityPostureReportSnapshot,
} from "@/types/reports";

interface ReportPreviewProps {
  reportId: string;
  title: string;
  status: string;
  version: number;
  clientName: string;
  snapshot: SecurityPostureReportSnapshot | null;
  errorSummary: string | null;
  canArchive: boolean;
}

/**
 * Server-rendered preview aligned with the PDF design language.
 * Uses the immutable snapshot only.
 */
export function ReportPreviewView({
  reportId,
  title,
  status,
  version,
  clientName,
  snapshot,
  errorSummary,
  canArchive,
}: ReportPreviewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs text-muted">
            <Link href="/reports" className="hover:text-accent">
              Reports
            </Link>
            {" / "}
            v{version}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted">
            {clientName} · {status} · Immutable snapshot preview
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(status === "READY" || status === "ARCHIVED") && (
            <a href={`/reports/${reportId}/download`}>
              <Button>Download PDF</Button>
            </a>
          )}
          {canArchive && status === "READY" && (
            <ReportArchiveButton reportId={reportId} />
          )}
        </div>
      </div>

      {status === "FAILED" && (
        <Card>
          <CardHeader>
            <CardTitle>Generation Failed</CardTitle>
            <CardDescription>
              {errorSummary ?? "An error occurred while generating this report."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!snapshot && status !== "FAILED" && (
        <Card>
          <CardContent className="py-8 text-sm text-muted">
            Snapshot not available.
          </CardContent>
        </Card>
      )}

      {snapshot && <SnapshotPreview snapshot={snapshot} />}
    </div>
  );
}

function SnapshotPreview({
  snapshot,
}: {
  snapshot: SecurityPostureReportSnapshot;
}) {
  const es = snapshot.executiveSummary;
  const remPct =
    es.remediationProgress.total === 0
      ? 0
      : Math.round(
          (es.remediationProgress.completed / es.remediationProgress.total) * 100
        );
  const sc = snapshot.findingSummary.statusCounts ?? {
    validated: snapshot.validatedFindings.length,
    openObservations: snapshot.openObservations.length,
    acceptedRisks: snapshot.acceptedRisks.length,
    resolved: 0,
    falsePositives: 0,
  };
  const trend = prepareTrendPoints(snapshot.scoreTrend);

  return (
    <div className="space-y-6">
      {/* Cover strip */}
      <div className="overflow-hidden rounded-lg border border-border bg-[#0a1628] p-6 text-white">
        <p className="text-xs tracking-[0.2em] text-[#3b82f6]">CLIENTSHIELD</p>
        <h2 className="mt-3 text-2xl font-semibold">Security Posture Report</h2>
        <p className="mt-2 text-lg text-slate-200">
          {snapshot.reportMetadata.clientName}
        </p>
        <div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500">Reporting period</p>
            <p>
              {formatDate(snapshot.reportMetadata.reportingPeriodStart)} –{" "}
              {formatDate(snapshot.reportMetadata.reportingPeriodEnd)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Generated</p>
            <p>{formatDate(snapshot.reportMetadata.generatedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Version</p>
            <p>{snapshot.reportMetadata.version}</p>
          </div>
        </div>
        <span className="mt-4 inline-block rounded bg-amber-700 px-3 py-1 text-xs font-semibold tracking-wide">
          CONFIDENTIAL
        </span>
      </div>

      {/* Executive KPIs */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-foreground">
          1. Executive Summary
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi
            label="Security Posture Score"
            value={
              es.posture.score == null ? "Not Assessed" : `${es.posture.score}/100`
            }
            accent
          />
          <Kpi
            label="Assessment Coverage"
            value={
              es.posture.coveragePercent != null
                ? `${es.posture.coveragePercent}%`
                : "—"
            }
          />
          <Kpi
            label="Assets Assessed"
            value={`${es.posture.assetsAssessed} / ${es.posture.assetsTotal}`}
          />
          <Kpi
            label="Open Scanner Observations"
            value={String(es.openObservations)}
          />
          <Kpi label="Accepted Risks" value={String(es.acceptedRisks)} />
          <Kpi label="Remediation Progress" value={`${remPct}%`} />
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["Critical", es.validatedBySeverity.critical],
              ["High", es.validatedBySeverity.high],
              ["Medium", es.validatedBySeverity.medium],
              ["Low", es.validatedBySeverity.low],
            ] as const
          ).map(([label, n]) => (
            <span
              key={label}
              className={`rounded px-2 py-1 text-xs font-medium text-white ${sevBg(label)}`}
            >
              {label} {n}
            </span>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Posture Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <p>{buildPostureOverview(snapshot)}</p>
            <p className="text-xs">{es.explanation}</p>
          </CardContent>
        </Card>
      </section>

      {/* Score */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">2. Security Posture Score</h3>
        <div className="grid gap-4 md:grid-cols-[160px_1fr]">
          <ScoreRing score={snapshot.postureDetail.score} />
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Validated Findings", "Full scoring impact"],
              ["Scanner Observations", "Provisional scoring impact"],
              ["Accepted Risks", "Residual scoring impact"],
              ["Resolved / False Positive", "No active scoring impact"],
            ].map(([t, d]) => (
              <div
                key={t}
                className="rounded-md border border-border bg-surface px-3 py-2"
              >
                <p className="text-sm font-medium text-foreground">{t}</p>
                <p className="text-xs text-muted">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Assets */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">3. Asset Overview</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-[#0a1628] text-white">
              <tr>
                {[
                  "Asset",
                  "Type",
                  "Environment",
                  "Criticality",
                  "Score",
                  "Coverage",
                  "Open",
                  "Validated",
                  "Last Assessed",
                ].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.assets.map((a, i) => (
                <tr
                  key={`${a.name}-${i}`}
                  className={i % 2 ? "bg-surface-elevated/40" : "bg-surface"}
                >
                  <td className="px-3 py-2 font-medium text-foreground">
                    {a.name}
                  </td>
                  <td className="px-3 py-2 text-muted">{a.type}</td>
                  <td className="px-3 py-2 text-muted">{a.environment}</td>
                  <td className="px-3 py-2 text-muted">{a.criticality}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {a.postureScore == null ? "—" : Math.round(a.postureScore)}
                  </td>
                  <td className="px-3 py-2 text-muted">{a.coverage ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{a.openFindings}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {a.validatedFindings}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {a.lastAssessedAt ? formatDate(a.lastAssessedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Finding summary */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">4. Finding Summary</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Severity Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <SeverityBars counts={snapshot.findingSummary.allBySeverity} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Lifecycle Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <StatusRow label="Validated Findings" value={sc.validated} />
              <StatusRow
                label="Scanner Observations Pending Review"
                value={sc.openObservations}
              />
              <StatusRow label="Accepted Risks" value={sc.acceptedRisks} />
              <StatusRow label="Resolved Findings" value={sc.resolved} />
              <StatusRow label="False Positives" value={sc.falsePositives} />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Validated */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">5. Validated Findings</h3>
        {snapshot.validatedFindings.length === 0 ? (
          <p className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted">
            No analyst-validated findings were recorded within the reporting
            scope. This does not guarantee that systems are free from
            vulnerabilities.
          </p>
        ) : (
          snapshot.validatedFindings.map((f, i) => (
            <Card key={`${f.title}-${i}`}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{f.title}</CardTitle>
                  <Badge sev={f.severity} />
                  {f.priority && (
                    <span className="rounded bg-surface-elevated px-2 py-0.5 text-[10px] text-muted">
                      PRIORITY {f.priority}
                    </span>
                  )}
                </div>
                <CardDescription>
                  {f.assetName} · {f.source}
                  {f.cweId ? ` · CWE ${f.cweId}` : ""} · Locations{" "}
                  {f.instanceCount}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted">
                {f.businessImpact && <p>Business impact: {f.businessImpact}</p>}
                {f.remediationGuidance && (
                  <p>Guidance: {f.remediationGuidance}</p>
                )}
                <p>Remediation status: {f.remediationStatus ?? "—"}</p>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {/* Observations */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">6. Scanner Observations</h3>
        <p className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-muted">
          Scanner observations are automated detections that have not necessarily
          been validated by a security analyst. They may include false positives
          and should not be interpreted as confirmed vulnerabilities.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-[#0a1628] text-white">
              <tr>
                {[
                  "Observation",
                  "Severity",
                  "Source",
                  "Confidence",
                  "Asset",
                  "Locations",
                ].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.openObservations.map((o, i) => (
                <tr
                  key={`${o.title}-${i}`}
                  className={i % 2 ? "bg-surface-elevated/40" : "bg-surface"}
                >
                  <td className="px-3 py-2 font-medium">{o.title}</td>
                  <td className="px-3 py-2">
                    <Badge sev={o.severity} />
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {o.source.replace(/_/g, " ")}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {o.confidence ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted">{o.assetName}</td>
                  <td className="px-3 py-2 tabular-nums">{o.instanceCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Accepted risks */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">7. Accepted Risks</h3>
        {snapshot.acceptedRisks.length === 0 ? (
          <p className="text-sm text-muted">None in scope.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-[#0a1628] text-white">
                <tr>
                  {[
                    "Finding",
                    "Severity",
                    "Asset",
                    "Reason",
                    "Approved By",
                    "Approved",
                    "Review",
                  ].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshot.acceptedRisks.map((r, i) => (
                  <tr
                    key={`${r.title}-${i}`}
                    className={i % 2 ? "bg-surface-elevated/40" : "bg-surface"}
                  >
                    <td className="px-3 py-2 font-medium">{r.title}</td>
                    <td className="px-3 py-2">
                      <Badge sev={r.severity} />
                    </td>
                    <td className="px-3 py-2 text-muted">{r.assetName}</td>
                    <td className="px-3 py-2 text-muted">{r.reason ?? "—"}</td>
                    <td className="px-3 py-2 text-muted">
                      {r.approvedBy ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {r.approvedAt ? formatDate(r.approvedAt) : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {r.reviewDate ? formatDate(r.reviewDate) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Remediation */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">8. Remediation Status</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(
            [
              ["Open", snapshot.remediation.open],
              ["In Progress", snapshot.remediation.inProgress],
              ["Blocked", snapshot.remediation.blocked],
              ["Completed", snapshot.remediation.completed],
              ["Overdue", snapshot.remediation.overdue],
            ] as const
          ).map(([l, v]) => (
            <Kpi key={l} label={l} value={String(v)} />
          ))}
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-[#0a1628] text-white">
              <tr>
                {[
                  "Finding",
                  "Severity",
                  "Priority",
                  "Status",
                  "Assigned To",
                  "Due Date",
                ].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.remediation.tasks.map((t, i) => (
                <tr
                  key={`${t.title}-${i}`}
                  className={i % 2 ? "bg-surface-elevated/40" : "bg-surface"}
                >
                  <td className="px-3 py-2 font-medium">
                    {t.findingTitle ?? t.title}
                  </td>
                  <td className="px-3 py-2 text-muted">{t.severity ?? "—"}</td>
                  <td className="px-3 py-2 text-muted">{t.priority}</td>
                  <td className="px-3 py-2 text-muted">
                    {t.status.replace(/_/g, " ")}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {t.assignedTo ?? "Unassigned"}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {t.dueDate ? formatDate(t.dueDate) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Trend */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">9. Score Trend</h3>
        {snapshot.scoreTrendInsufficient || trend.length < 2 ? (
          <p className="text-sm text-muted">
            Insufficient historical data to display a meaningful posture trend.
          </p>
        ) : (
          <TrendSvg points={trend} />
        )}
      </section>

      {/* Methodology */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">10. Assessment Methodology</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {snapshot.methodology.passiveChecksUsed && (
            <MethodCard
              title="Passive Website Security Checks"
              items={[
                "HTTPS",
                "TLS",
                "Security headers",
                "Cookie security",
              ]}
            />
          )}
          {snapshot.methodology.zapBaselineUsed && (
            <MethodCard
              title="OWASP ZAP Baseline"
              items={[
                "Passive analysis",
                "Automated crawling",
                "Passive rules",
                "No active exploitation",
              ]}
            />
          )}
          {snapshot.methodology.analystTriageUsed && (
            <MethodCard
              title="Analyst Triage"
              items={[
                "Validation",
                "False-positive handling",
                "Risk acceptance",
                "Remediation workflow",
              ]}
            />
          )}
        </div>
      </section>

      {/* Limitations */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">11. Limitations</h3>
        <ul className="list-disc space-y-1 rounded-md border border-border bg-surface px-5 py-4 text-sm text-muted">
          {snapshot.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface px-4 py-3 ${
        accent ? "border-l-4 border-l-accent" : "border-l-4 border-l-[#1e3a5f]"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function Badge({ sev }: { sev: string }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold text-white ${sevBg(sev)}`}
    >
      {sev.toUpperCase()}
    </span>
  );
}

function sevBg(sev: string): string {
  switch (sev.toUpperCase()) {
    case "CRITICAL":
      return "bg-red-600";
    case "HIGH":
      return "bg-orange-600";
    case "MEDIUM":
      return "bg-yellow-600";
    case "LOW":
      return "bg-blue-600";
    default:
      return "bg-slate-500";
  }
}

function SeverityBars({ counts }: { counts: ReportFindingCounts }) {
  const rows = [
    ["Critical", counts.critical, "bg-red-600"],
    ["High", counts.high, "bg-orange-600"],
    ["Medium", counts.medium, "bg-yellow-600"],
    ["Low", counts.low, "bg-blue-600"],
    ["Info", counts.info, "bg-slate-500"],
  ] as const;
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="space-y-2">
      {rows.map(([label, n, color]) => (
        <div key={label} className="flex items-center gap-2 text-xs">
          <span className="w-16 text-muted">{label}</span>
          <div className="h-2 flex-1 rounded bg-surface-elevated">
            <div
              className={`h-2 rounded ${color}`}
              style={{ width: `${(n / max) * 100}%` }}
            />
          </div>
          <span className="w-6 tabular-nums text-foreground">{n}</span>
        </div>
      ))}
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function ScoreRing({ score }: { score: number | null }) {
  const v = score == null ? 0 : Math.max(0, Math.min(100, score));
  const r = 54;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c * 0.75;
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface p-4">
      <svg width="140" height="120" viewBox="0 0 140 120" aria-hidden>
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="#1e293b"
          strokeWidth="10"
          strokeDasharray={`${c * 0.75} ${c}`}
          strokeLinecap="round"
          transform="rotate(135 70 70)"
        />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="10"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          transform="rotate(135 70 70)"
        />
        <text
          x="70"
          y="68"
          textAnchor="middle"
          className="fill-foreground"
          fontSize="28"
          fontWeight="600"
        >
          {score == null ? "—" : Math.round(score)}
        </text>
        <text
          x="70"
          y="88"
          textAnchor="middle"
          className="fill-muted"
          fontSize="11"
        >
          {score == null ? "Not Assessed" : "/ 100"}
        </text>
      </svg>
    </div>
  );
}

function TrendSvg({
  points,
}: {
  points: Array<{ score: number; label: string }>;
}) {
  const w = 640;
  const h = 180;
  const pad = 28;
  const coords = points.map((p, i) => {
    const x =
      pad +
      (points.length === 1
        ? (w - pad * 2) / 2
        : (i / (points.length - 1)) * (w - pad * 2));
    const y = pad + (1 - p.score / 100) * (h - pad * 2);
    return { x, y, ...p };
  });
  const d = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface p-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-48 w-full min-w-[480px]">
        <line
          x1={pad}
          y1={h - pad}
          x2={w - pad}
          y2={h - pad}
          stroke="#1e293b"
        />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#1e293b" />
        <path d={d} fill="none" stroke="#3b82f6" strokeWidth="2" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="3" fill="#3b82f6" />
        ))}
      </svg>
    </div>
  );
}

function MethodCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-4 text-sm text-muted">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
