import type { FindingSeverity, FindingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { calculateClientSecurityPosture } from "@/services/scoring/client-security-score.service";
import { calculateAssetSecurityPosture } from "@/services/scoring/asset-security-score.service";
import {
  extractSafeConfidence,
  extractSafeCwe,
  sanitizeReportText,
} from "@/services/reports/report-security.service";
import { SCORE_DISCLAIMER } from "@/types/scoring";
import type {
  ReportFindingCounts,
  SecurityPostureReportSnapshot,
} from "@/types/reports";

function emptyCounts(): ReportFindingCounts {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

function bump(counts: ReportFindingCounts, severity: FindingSeverity) {
  const key =
    severity === "CRITICAL"
      ? "critical"
      : severity === "HIGH"
        ? "high"
        : severity === "MEDIUM"
          ? "medium"
          : severity === "LOW"
            ? "low"
            : "info";
  counts[key] += 1;
}

/**
 * Collects tenant-scoped client security data for report generation.
 */
export async function collectClientReportData(input: {
  organizationId: string;
  clientId: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<{
  client: { id: string; name: string };
  organizationName: string;
  findings: Awaited<ReturnType<typeof loadFindings>>;
  assets: Awaited<ReturnType<typeof loadAssets>>;
  remediationTasks: Awaited<ReturnType<typeof loadRemediation>>;
  scans: Awaited<ReturnType<typeof loadScans>>;
  scoreSnapshots: Awaited<ReturnType<typeof loadSnapshots>>;
  clientPosture: Awaited<ReturnType<typeof calculateClientSecurityPosture>>;
}> {
  const client = await prisma.client.findFirst({
    where: {
      id: input.clientId,
      organizationId: input.organizationId,
    },
    select: { id: true, name: true },
  });
  if (!client) throw new Error("Client not found");

  const org = await prisma.organization.findFirst({
    where: { id: input.organizationId },
    select: { name: true },
  });

  const [findings, assets, remediationTasks, scans, scoreSnapshots, clientPosture] =
    await Promise.all([
      loadFindings(input),
      loadAssets(input),
      loadRemediation(input),
      loadScans(input),
      loadSnapshots(input),
      calculateClientSecurityPosture(input.organizationId, input.clientId),
    ]);

  return {
    client,
    organizationName: org?.name ?? "Organization",
    findings,
    assets,
    remediationTasks,
    scans,
    scoreSnapshots,
    clientPosture,
  };
}

async function loadFindings(input: {
  organizationId: string;
  clientId: string;
}) {
  return prisma.finding.findMany({
    where: {
      organizationId: input.organizationId,
      clientId: input.clientId,
    },
    include: {
      asset: { select: { name: true } },
      acceptedRiskApprovedBy: { select: { name: true, email: true } },
      remediationTasks: {
        select: { status: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      _count: { select: { instances: true } },
    },
    orderBy: [{ severity: "desc" }, { lastDetectedAt: "desc" }],
  });
}

async function loadAssets(input: {
  organizationId: string;
  clientId: string;
}) {
  return prisma.asset.findMany({
    where: {
      organizationId: input.organizationId,
      clientId: input.clientId,
    },
    select: {
      id: true,
      name: true,
      type: true,
      environment: true,
      criticality: true,
      lastSecurityCheckAt: true,
    },
    orderBy: { name: "asc" },
  });
}

async function loadRemediation(input: {
  organizationId: string;
  clientId: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  return prisma.remediationTask.findMany({
    where: {
      organizationId: input.organizationId,
      asset: { clientId: input.clientId },
      OR: [
        {
          createdAt: {
            gte: input.periodStart,
            lte: input.periodEnd,
          },
        },
        {
          status: { in: ["OPEN", "IN_PROGRESS", "BLOCKED"] },
        },
      ],
    },
    include: {
      finding: { select: { title: true, severity: true } },
      assignedTo: { select: { name: true, email: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
}

async function loadScans(input: {
  organizationId: string;
  clientId: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  return prisma.scan.findMany({
    where: {
      organizationId: input.organizationId,
      asset: { clientId: input.clientId },
      status: { in: ["COMPLETED", "PARTIAL"] },
      OR: [
        {
          completedAt: {
            gte: input.periodStart,
            lte: input.periodEnd,
          },
        },
        {
          createdAt: {
            gte: input.periodStart,
            lte: input.periodEnd,
          },
        },
      ],
    },
    select: { scanType: true, completedAt: true },
  });
}

async function loadSnapshots(input: {
  organizationId: string;
  clientId: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  return prisma.securityScoreSnapshot.findMany({
    where: {
      organizationId: input.organizationId,
      OR: [
        { clientId: input.clientId },
        { asset: { clientId: input.clientId } },
      ],
      calculatedAt: {
        gte: input.periodStart,
        lte: input.periodEnd,
      },
    },
    orderBy: { calculatedAt: "asc" },
    take: 100,
  });
}

export async function buildSecurityPostureSnapshot(input: {
  organizationId: string;
  clientId: string;
  title: string;
  periodStart: Date;
  periodEnd: Date;
  version: number;
}): Promise<SecurityPostureReportSnapshot> {
  const data = await collectClientReportData(input);
  const now = new Date();

  const validatedStatuses: FindingStatus[] = ["VALIDATED", "IN_PROGRESS"];
  const allBySeverity = emptyCounts();
  const validatedBySeverity = emptyCounts();
  const openObsBySeverity = emptyCounts();

  for (const f of data.findings) {
    if (f.status === "FALSE_POSITIVE") continue;
    bump(allBySeverity, f.severity);
    if (validatedStatuses.includes(f.status)) bump(validatedBySeverity, f.severity);
    if (f.status === "OPEN") bump(openObsBySeverity, f.severity);
  }

  const validatedFindings = data.findings
    .filter((f) => validatedStatuses.includes(f.status))
    .map((f) => ({
      title: f.title,
      severity: f.severity,
      priority: f.triagePriority,
      status: f.status,
      assetName: f.asset.name,
      source: f.source,
      cweId: extractSafeCwe(f.evidence),
      instanceCount: Math.max(1, f._count.instances || 1),
      description: sanitizeReportText(f.description, 800),
      businessImpact: f.businessImpact,
      remediationGuidance: sanitizeReportText(f.remediationGuidance, 800),
      remediationStatus: f.remediationTasks[0]?.status ?? null,
    }));

  const openObservations = data.findings
    .filter((f) => f.status === "OPEN")
    .map((f) => ({
      title: f.title,
      severity: f.severity,
      source: f.source,
      confidence: extractSafeConfidence(f.evidence),
      assetName: f.asset.name,
      instanceCount: Math.max(1, f._count.instances || 1),
    }));

  const acceptedRisks = data.findings
    .filter((f) => f.status === "ACCEPTED_RISK")
    .map((f) => ({
      title: f.title,
      severity: f.severity,
      assetName: f.asset.name,
      reason: sanitizeReportText(f.statusReason, 500),
      approvedBy:
        f.acceptedRiskApprovedBy?.name ??
        f.acceptedRiskApprovedBy?.email ??
        null,
      approvedAt: f.acceptedRiskApprovedAt?.toISOString() ?? null,
      reviewDate: f.acceptedRiskReviewDate?.toISOString() ?? null,
    }));

  const assetRows = [];
  for (const asset of data.assets) {
    const posture = await calculateAssetSecurityPosture(
      input.organizationId,
      asset.id
    );
    const assetFindings = data.findings.filter((f) => f.assetId === asset.id);
    assetRows.push({
      name: asset.name,
      type: asset.type,
      environment: asset.environment,
      criticality: asset.criticality,
      postureScore: posture.displayScore,
      coverage: posture.coverage,
      lastAssessedAt:
        posture.lastAssessedAt?.toISOString() ??
        asset.lastSecurityCheckAt?.toISOString() ??
        null,
      openFindings: assetFindings.filter((f) => f.status === "OPEN").length,
      validatedFindings: assetFindings.filter((f) =>
        validatedStatuses.includes(f.status)
      ).length,
    });
  }

  const nowMs = Date.now();
  const rem = data.remediationTasks;
  const remSummary = {
    total: rem.length,
    open: rem.filter((t) => t.status === "OPEN").length,
    inProgress: rem.filter((t) => t.status === "IN_PROGRESS").length,
    blocked: rem.filter((t) => t.status === "BLOCKED").length,
    completed: rem.filter((t) => t.status === "COMPLETED").length,
    overdue: rem.filter(
      (t) =>
        t.dueDate &&
        t.dueDate.getTime() < nowMs &&
        ["OPEN", "IN_PROGRESS", "BLOCKED"].includes(t.status)
    ).length,
    tasks: rem.map((t) => ({
      title: t.title,
      findingTitle: t.finding?.title ?? null,
      severity: t.finding?.severity ?? null,
      priority: t.priority,
      status: t.status,
      assignedTo: t.assignedTo?.name ?? t.assignedTo?.email ?? null,
      dueDate: t.dueDate?.toISOString() ?? null,
    })),
  };

  // Prefer client-level snapshots; fall back to asset averages by day
  const clientSnaps = data.scoreSnapshots.filter((s) => s.clientId === input.clientId);
  const trendSource =
    clientSnaps.length > 0
      ? clientSnaps
      : data.scoreSnapshots.filter((s) => s.assetId != null);

  const scoreTrend = trendSource.map((s) => ({
    date: s.calculatedAt.toISOString(),
    score: s.score,
    coverage: s.coverage,
  }));

  const passiveUsed = data.scans.some((s) => s.scanType === "PASSIVE_WEBSITE");
  const zapUsed = data.scans.some((s) => s.scanType === "ZAP_BASELINE");
  const triageUsed = data.findings.some(
    (f) =>
      f.status === "VALIDATED" ||
      f.status === "FALSE_POSITIVE" ||
      f.status === "ACCEPTED_RISK" ||
      f.validatedAt != null
  );

  const methods: string[] = [];
  if (passiveUsed) {
    methods.push(
      "Passive Website Security Checks (HTTPS availability, TLS certificate configuration, security headers, cookie security observations)"
    );
  }
  if (zapUsed) {
    methods.push(
      "OWASP ZAP Baseline (passive web application analysis with automated crawling; no active exploitation)"
    );
  }
  if (triageUsed) {
    methods.push(
      "Analyst Triage (scanner findings may be reviewed and validated; false positives may be excluded; accepted risks remain represented in posture scoring)"
    );
  }

  const posture = data.clientPosture;

  return {
    schemaVersion: 1,
    reportMetadata: {
      reportType: "SECURITY_POSTURE",
      title: input.title,
      clientName: data.client.name,
      reportingPeriodStart: input.periodStart.toISOString(),
      reportingPeriodEnd: input.periodEnd.toISOString(),
      generatedAt: now.toISOString(),
      version: input.version,
      confidentiality: "CONFIDENTIAL",
      organizationName: data.organizationName,
    },
    executiveSummary: {
      posture: {
        score: posture.displayScore,
        coverage:
          posture.coveragePercent != null
            ? `${posture.coveragePercent}% assets assessed`
            : null,
        assetsAssessed: posture.assessedAssets,
        assetsTotal: posture.totalAssets,
        coveragePercent: posture.coveragePercent,
        openFindings: posture.openFindings,
        validatedFindings: posture.validatedFindings,
        acceptedRisks: posture.acceptedRisks,
        disclaimer: SCORE_DISCLAIMER,
      },
      validatedBySeverity,
      openObservations: openObservations.length,
      acceptedRisks: acceptedRisks.length,
      remediationProgress: {
        completed: remSummary.completed,
        total: remSummary.total,
      },
      explanation: SCORE_DISCLAIMER,
    },
    postureDetail: {
      score: posture.displayScore,
      coverage:
        posture.coveragePercent != null
          ? `${posture.coveragePercent}%`
          : "Not Assessed",
      breakdownNotes: [
        "Validated findings reduce the posture score with full weight.",
        "Open scanner observations contribute provisional impact until analyst validation.",
        "Accepted risks retain partial residual impact.",
        "Asset criticality and affected-location exposure modifiers may increase impact.",
        "False positives and resolved findings do not reduce the score.",
      ],
    },
    assets: assetRows,
    findingSummary: {
      allBySeverity,
      validatedBySeverity,
      openObservationsBySeverity: openObsBySeverity,
      statusCounts: {
        validated: validatedFindings.length,
        openObservations: openObservations.length,
        acceptedRisks: acceptedRisks.length,
        resolved: data.findings.filter((f) => f.status === "RESOLVED").length,
        falsePositives: data.findings.filter((f) => f.status === "FALSE_POSITIVE")
          .length,
      },
    },
    validatedFindings,
    openObservations,
    acceptedRisks,
    remediation: remSummary,
    scoreTrend,
    scoreTrendInsufficient: scoreTrend.length < 2,
    methodology: {
      passiveChecksUsed: passiveUsed,
      zapBaselineUsed: zapUsed,
      analystTriageUsed: triageUsed,
      methods:
        methods.length > 0
          ? methods
          : [
              "No completed assessments were recorded for this client during the reporting period.",
            ],
    },
    limitations: [
      "This report reflects the scope and assessment methods configured in ClientShield during the stated reporting period.",
      "Results represent observations available at the time of assessment and analyst triage.",
      "The absence of reported findings does not guarantee that systems are free from vulnerabilities.",
      "This report is not a penetration test, compliance certification, or security guarantee unless explicitly stated under a separate engagement.",
      "Scanner observations that have not been validated may include false positives.",
    ],
  };
}
