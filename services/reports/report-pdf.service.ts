import PDFDocument from "pdfkit";
import type { SecurityPostureReportSnapshot } from "@/types/reports";
import { SCORE_DISCLAIMER } from "@/types/scoring";
import {
  drawHorizontalSeverityBars,
  drawLineChart,
  drawProgressBar,
  drawScoreGauge,
  drawSegmentedStatusBar,
} from "@/services/reports/pdf/charts";
import {
  buildPostureOverview,
  prepareTrendPoints,
} from "@/services/reports/pdf/narrative";
import {
  applyContentMargins,
  drawBanner,
  drawKpiCard,
  drawTableHeader,
  drawTableRow,
  ensureSpace,
  fmtDate,
  fmtDateTime,
  newSectionPage,
  sectionHeading,
  setCursor,
  severityBadge,
  type TableColumn,
} from "@/services/reports/pdf/primitives";
import { PDF, contentWidth, severityColor } from "@/services/reports/pdf/theme";

type SectionMark = { title: string; page: number };

/**
 * Professional A4 Security Posture PDF — snapshot only, server-side PDFKit.
 */
export async function renderSecurityPosturePdf(
  snapshot: SecurityPostureReportSnapshot
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: PDF.page.marginTop,
        bottom: PDF.page.marginBottom,
        left: PDF.page.marginLeft,
        right: PDF.page.marginRight,
      },
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: snapshot.reportMetadata.title,
        Author: "ClientShield Security Operations",
        Subject: "Security Posture Report",
        Keywords: "ClientShield, cybersecurity, posture, confidential",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const meta = snapshot.reportMetadata;
    const marks: SectionMark[] = [];
    const mark = (title: string) => {
      const range = doc.bufferedPageRange();
      marks.push({
        title,
        page: range.start + range.count, // 1-based once finalized relative to cover
      });
    };

    // ——— Cover ———
    drawCover(doc, snapshot);

    // ——— TOC placeholder page ———
    doc.addPage();
    applyContentMargins(doc);
    const tocPageIndex = doc.bufferedPageRange().count - 1;
    doc.y = PDF.page.marginTop;

    // ——— Content (page breaks only between major groups) ———
    newSectionPage(doc);
    mark("1. Executive Summary");
    drawExecutiveSummary(doc, snapshot);

    ensureSpace(doc, 220);
    mark("2. Security Posture Score");
    drawPostureScore(doc, snapshot);

    ensureSpace(doc, 160);
    mark("3. Asset Overview");
    drawAssetOverview(doc, snapshot);

    newSectionPage(doc);
    mark("4. Finding Summary");
    drawFindingSummary(doc, snapshot);

    ensureSpace(doc, 120);
    mark("5. Validated Findings");
    drawValidatedFindings(doc, snapshot);

    ensureSpace(doc, 160);
    mark("6. Scanner Observations");
    drawScannerObservations(doc, snapshot);

    ensureSpace(doc, 140);
    mark("7. Accepted Risks");
    drawAcceptedRisks(doc, snapshot);

    newSectionPage(doc);
    mark("8. Remediation Status");
    drawRemediation(doc, snapshot);

    ensureSpace(doc, 220);
    mark("9. Score Trend");
    drawScoreTrend(doc, snapshot);

    ensureSpace(doc, 200);
    mark("10. Assessment Methodology");
    drawMethodology(doc, snapshot);

    ensureSpace(doc, 180);
    mark("11. Limitations");
    drawLimitations(doc, snapshot);

    // Fill TOC
    fillToc(doc, tocPageIndex, marks, meta.clientName);

    // Headers / footers (skip cover = page 0)
    const range = doc.bufferedPageRange();
    const total = range.count;
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const pageNo = i - range.start + 1;
      if (pageNo === 1) continue; // cover
      drawHeader(doc, meta.clientName);
      drawFooter(doc, meta.generatedAt, pageNo, total);
    }

    doc.end();
  });
}

function drawCover(
  doc: PDFKit.PDFDocument,
  snapshot: SecurityPostureReportSnapshot
): void {
  const meta = snapshot.reportMetadata;
  const W = doc.page.width;
  const H = doc.page.height;

  // Full navy backdrop with accent geometry
  doc.rect(0, 0, W, H).fill(PDF.color.navy);
  doc.rect(0, 0, 18, H).fill(PDF.color.accent);

  // Subtle geometric pattern (right side)
  doc.save();
  doc.opacity(0.1);
  doc.strokeColor(PDF.color.white).lineWidth(1);
  for (let i = 0; i < 10; i++) {
    const ox = W - 80 - i * 16;
    const oy = 100 + i * 32;
    doc
      .moveTo(ox, oy)
      .lineTo(ox + 48, oy + 24)
      .lineTo(ox + 48, oy + 56)
      .lineTo(ox, oy + 32)
      .closePath()
      .stroke();
  }
  doc.restore();
  doc.opacity(1);

  // Brand
  doc
    .fontSize(PDF.type.coverBrand)
    .fillColor(PDF.color.accent)
    .text("CLIENTSHIELD", 56, 72, { characterSpacing: 3 });
  doc
    .fontSize(9)
    .fillColor("#94a3b8")
    .text("Security Operations", 56, 92);

  doc
    .fontSize(PDF.type.coverTitle)
    .fillColor(PDF.color.white)
    .text("Security Posture Report", 56, 180, { width: W - 120 });

  doc
    .moveTo(56, 230)
    .lineTo(200, 230)
    .strokeColor(PDF.color.accent)
    .lineWidth(2)
    .stroke();

  doc
    .fontSize(PDF.type.coverClient)
    .fillColor(PDF.color.white)
    .text(meta.clientName, 56, 250, { width: W - 120 });

  const metaY = 330;
  doc.fontSize(9).fillColor("#94a3b8").text("REPORTING PERIOD", 56, metaY);
  doc
    .fontSize(12)
    .fillColor(PDF.color.white)
    .text(
      `${fmtDate(meta.reportingPeriodStart)}  –  ${fmtDate(meta.reportingPeriodEnd)}`,
      56,
      metaY + 16
    );

  doc.fontSize(9).fillColor("#94a3b8").text("GENERATED", 56, metaY + 56);
  doc
    .fontSize(12)
    .fillColor(PDF.color.white)
    .text(fmtDateTime(meta.generatedAt), 56, metaY + 72);

  doc.fontSize(9).fillColor("#94a3b8").text("VERSION", 56, metaY + 112);
  doc
    .fontSize(12)
    .fillColor(PDF.color.white)
    .text(String(meta.version), 56, metaY + 128);

  // Confidential badge
  doc
    .roundedRect(56, H - 140, 130, 28, 4)
    .fill(PDF.color.confidential);
  doc
    .fontSize(11)
    .fillColor(PDF.color.white)
    .text("CONFIDENTIAL", 56, H - 132, {
      width: 130,
      align: "center",
      characterSpacing: 1.5,
    });

  doc
    .fontSize(9)
    .fillColor("#94a3b8")
    .text("Prepared by ClientShield Security Operations", 56, H - 72, {
      width: W - 112,
    });
}

function fillToc(
  doc: PDFKit.PDFDocument,
  tocPageIndex: number,
  marks: SectionMark[],
  clientName: string
): void {
  doc.switchToPage(tocPageIndex);
  applyContentMargins(doc);
  let y = PDF.page.marginTop;

  doc
    .fontSize(PDF.type.section)
    .fillColor(PDF.color.navy)
    .text("Contents", PDF.page.marginLeft, y);
  y = doc.y + 6;
  doc
    .fontSize(9)
    .fillColor(PDF.color.inkFaint)
    .text(`Security Posture Report · ${clientName}`, PDF.page.marginLeft, y);
  y = doc.y + 18;

  for (const m of marks) {
    const pageLabel = String(m.page);
    doc
      .fontSize(10)
      .fillColor(PDF.color.ink)
      .text(m.title, PDF.page.marginLeft, y, {
        width: contentWidth(doc) - 36,
        continued: false,
      });
    doc
      .fontSize(10)
      .fillColor(PDF.color.inkFaint)
      .text(pageLabel, PDF.page.marginLeft, y, {
        width: contentWidth(doc),
        align: "right",
      });
    y += 18;
  }
  doc.y = y;
}

function drawHeader(doc: PDFKit.PDFDocument, clientName: string): void {
  const saved = { ...doc.page.margins };
  doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
  const y = 28;
  doc
    .fontSize(8)
    .fillColor(PDF.color.accent)
    .text(
      `ClientShield  ·  Security Posture Report  ·  ${clientName}`,
      PDF.page.marginLeft,
      y,
      {
        width: contentWidth(doc),
        lineBreak: false,
      }
    );
  doc
    .moveTo(PDF.page.marginLeft, 46)
    .lineTo(doc.page.width - PDF.page.marginRight, 46)
    .strokeColor(PDF.color.line)
    .lineWidth(0.6)
    .stroke();
  doc.page.margins = saved;
}

function drawFooter(
  doc: PDFKit.PDFDocument,
  generatedAt: string,
  page: number,
  total: number
): void {
  const saved = { ...doc.page.margins };
  doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
  const y = doc.page.height - 36;
  doc
    .moveTo(PDF.page.marginLeft, y - 8)
    .lineTo(doc.page.width - PDF.page.marginRight, y - 8)
    .strokeColor(PDF.color.line)
    .lineWidth(0.6)
    .stroke();
  const w = contentWidth(doc);
  doc
    .fontSize(7.5)
    .fillColor(PDF.color.confidential)
    .text("CONFIDENTIAL", PDF.page.marginLeft, y, {
      width: w / 3,
      align: "left",
      lineBreak: false,
    });
  doc
    .fillColor(PDF.color.inkFaint)
    .text(`Generated ${fmtDate(generatedAt)}`, PDF.page.marginLeft + w / 3, y, {
      width: w / 3,
      align: "center",
      lineBreak: false,
    });
  doc
    .fillColor(PDF.color.inkMuted)
    .text(`Page ${page} of ${total}`, PDF.page.marginLeft + (2 * w) / 3, y, {
      width: w / 3,
      align: "right",
      lineBreak: false,
    });
  doc.page.margins = saved;
}

function drawExecutiveSummary(
  doc: PDFKit.PDFDocument,
  snapshot: SecurityPostureReportSnapshot
): void {
  sectionHeading(doc, "1", "Executive Summary");
  const es = snapshot.executiveSummary;
  const w = contentWidth(doc);
  const gap = 10;
  const cardW = (w - gap * 2) / 3;
  const cardH = 64;
  let x = PDF.page.marginLeft;
  let y = doc.y;

  const remPct =
    es.remediationProgress.total === 0
      ? 0
      : Math.round(
          (es.remediationProgress.completed / es.remediationProgress.total) * 100
        );

  const kpis: Array<[string, string, string]> = [
    [
      "Security Posture Score",
      es.posture.score == null ? "Not Assessed" : `${es.posture.score} / 100`,
      PDF.color.accent,
    ],
    [
      "Assessment Coverage",
      es.posture.coveragePercent != null
        ? `${es.posture.coveragePercent}%`
        : "—",
      PDF.color.navyMid,
    ],
    [
      "Assets Assessed",
      `${es.posture.assetsAssessed} / ${es.posture.assetsTotal}`,
      PDF.color.navyMid,
    ],
    [
      "Open Scanner Observations",
      String(es.openObservations),
      PDF.color.warning,
    ],
    ["Accepted Risks", String(es.acceptedRisks), PDF.color.medium],
    ["Remediation Progress", `${remPct}%`, PDF.color.success],
  ];

  for (let i = 0; i < kpis.length; i++) {
    const [label, value, accent] = kpis[i]!;
    if (i === 3) {
      y += cardH + gap;
      x = PDF.page.marginLeft;
    }
    drawKpiCard(doc, x, y, cardW, cardH, label, value, accent);
    x += cardW + gap;
  }
  setCursor(doc, y + cardH + 16);

  // Validated severity counters
  doc
    .fontSize(PDF.type.sub)
    .fillColor(PDF.color.navy)
    .text("Validated Findings by Severity", PDF.page.marginLeft, doc.y, {
      lineBreak: false,
    });
  setCursor(doc, doc.y + 16);
  const v = es.validatedBySeverity;
  let bx = PDF.page.marginLeft;
  const badgeY = doc.y;
  for (const [label, count] of [
    ["Critical", v.critical],
    ["High", v.high],
    ["Medium", v.medium],
    ["Low", v.low],
  ] as const) {
    const bw = severityBadge(doc, label, bx, badgeY);
    doc
      .fontSize(10)
      .fillColor(PDF.color.ink)
      .text(`  ${count}`, bx + bw, badgeY + 1, { lineBreak: false });
    bx += bw + 36;
  }
  setCursor(doc, badgeY + 28);

  doc
    .fontSize(PDF.type.sub)
    .fillColor(PDF.color.navy)
    .text("Posture Overview", PDF.page.marginLeft, doc.y, { lineBreak: false });
  setCursor(doc, doc.y + 14);
  const overview = buildPostureOverview(snapshot);
  doc.fontSize(PDF.type.body);
  const overviewH = Math.min(72, doc.heightOfString(overview, { width: w }) + 4);
  ensureSpace(doc, overviewH + 20);
  const oy = doc.y;
  doc
    .fontSize(PDF.type.body)
    .fillColor(PDF.color.inkMuted)
    .text(overview, PDF.page.marginLeft, oy, {
      width: w,
      height: overviewH,
      ellipsis: true,
    });
  setCursor(doc, oy + overviewH + 10);
  drawBanner(doc, SCORE_DISCLAIMER, "neutral");
}

function drawPostureScore(
  doc: PDFKit.PDFDocument,
  snapshot: SecurityPostureReportSnapshot
): void {
  sectionHeading(doc, "2", "Security Posture Score");
  const w = contentWidth(doc);
  const score = snapshot.postureDetail.score;

  ensureSpace(doc, 160);
  const panelY = doc.y;
  doc
    .roundedRect(PDF.page.marginLeft, panelY, w, 150, 8)
    .fill(PDF.color.surface);
  doc
    .roundedRect(PDF.page.marginLeft, panelY, w, 150, 8)
    .strokeColor(PDF.color.line)
    .lineWidth(0.8)
    .stroke();

  drawScoreGauge(doc, PDF.page.marginLeft + 24, panelY + 16, 120, score);

  doc
    .fontSize(PDF.type.sub)
    .fillColor(PDF.color.navy)
    .text("Assessment Coverage", PDF.page.marginLeft + 170, panelY + 28, {
      lineBreak: false,
    });
  doc
    .fontSize(14)
    .fillColor(PDF.color.ink)
    .text(
      snapshot.postureDetail.coverage ?? "Not Assessed",
      PDF.page.marginLeft + 170,
      panelY + 48,
      { lineBreak: false }
    );

  doc
    .fontSize(PDF.type.caption)
    .fillColor(PDF.color.inkFaint)
    .text(
      "Score colour reflects relative posture strength for visual hierarchy only.",
      PDF.page.marginLeft + 170,
      panelY + 78,
      { width: w - 200, lineBreak: true }
    );

  setCursor(doc, panelY + 166);

  doc
    .fontSize(PDF.type.sub)
    .fillColor(PDF.color.navy)
    .text("Score Influence Model", PDF.page.marginLeft, doc.y, {
      lineBreak: false,
    });
  setCursor(doc, doc.y + 14);

  const panels: Array<[string, string, string]> = [
    ["Validated Findings", "Full scoring impact", PDF.color.danger],
    ["Scanner Observations", "Provisional scoring impact", PDF.color.warning],
    ["Accepted Risks", "Residual scoring impact", PDF.color.medium],
    ["Resolved / False Positive", "No active scoring impact", PDF.color.success],
  ];
  const pw = (w - 12) / 2;
  let px = PDF.page.marginLeft;
  let py = doc.y;
  panels.forEach((p, i) => {
    if (i === 2) {
      py += 52;
      px = PDF.page.marginLeft;
    }
    doc.roundedRect(px, py, pw, 44, 5).fill(PDF.color.white);
    doc
      .roundedRect(px, py, pw, 44, 5)
      .strokeColor(PDF.color.line)
      .lineWidth(0.7)
      .stroke();
    doc.rect(px, py, 4, 44).fill(p[2]);
    doc
      .fontSize(9)
      .fillColor(PDF.color.ink)
      .text(p[0], px + 12, py + 10, { width: pw - 20, lineBreak: false });
    doc
      .fontSize(8)
      .fillColor(PDF.color.inkFaint)
      .text(p[1], px + 12, py + 26, { width: pw - 20, lineBreak: false });
    px += pw + 12;
  });
  setCursor(doc, py + 56);
  drawBanner(
    doc,
    "The ClientShield Security Posture Score is an internal posture indicator based on configured assessments and analyst triage. It is not a certification or guarantee of security.",
    "neutral"
  );
}

function drawAssetOverview(
  doc: PDFKit.PDFDocument,
  snapshot: SecurityPostureReportSnapshot
): void {
  sectionHeading(doc, "3", "Asset Overview");
  const cols: TableColumn[] = [
    { key: "name", label: "Asset", width: 118 },
    { key: "type", label: "Type", width: 52 },
    { key: "env", label: "Environment", width: 62 },
    { key: "crit", label: "Criticality", width: 58 },
    { key: "score", label: "Score", width: 40, align: "center" },
    { key: "cov", label: "Coverage", width: 48 },
    { key: "open", label: "Open", width: 34, align: "center" },
    { key: "val", label: "Validated", width: 48, align: "center" },
    { key: "last", label: "Last Assessed", width: 62 },
  ];

  if (snapshot.assets.length === 0) {
    doc
      .fontSize(PDF.type.body)
      .fillColor(PDF.color.inkFaint)
      .text("No assets were associated with this client.");
    return;
  }

  let y = doc.y;
  const x = PDF.page.marginLeft;
  y += drawTableHeader(doc, cols, x, y);

  snapshot.assets.forEach((a, i) => {
    ensureSpace(doc, 28);
    if (doc.y === PDF.page.marginTop || doc.y < y) {
      y = doc.y;
      y += drawTableHeader(doc, cols, x, y);
    }
    const h = drawTableRow(
      doc,
      cols,
      {
        name: a.name.length > 28 ? `${a.name.slice(0, 26)}…` : a.name,
        type: a.type,
        env: a.environment,
        crit: a.criticality,
        score: a.postureScore == null ? "—" : String(Math.round(a.postureScore)),
        cov: a.coverage ?? "—",
        open: String(a.openFindings),
        val: String(a.validatedFindings),
        last: a.lastAssessedAt ? fmtDate(a.lastAssessedAt) : "—",
      },
      x,
      y,
      i % 2 === 1
    );
    y += h;
    doc.y = y;
  });
  setCursor(doc, y + 12);
}

function drawFindingSummary(
  doc: PDFKit.PDFDocument,
  snapshot: SecurityPostureReportSnapshot
): void {
  sectionHeading(doc, "4", "Finding Summary");
  const w = contentWidth(doc);
  const fs = snapshot.findingSummary;

  ensureSpace(doc, 140);
  const sevY = doc.y;
  doc
    .fontSize(PDF.type.sub)
    .fillColor(PDF.color.navy)
    .text("Severity Distribution", PDF.page.marginLeft, sevY, {
      lineBreak: false,
    });
  const barH = drawHorizontalSeverityBars(
    doc,
    PDF.page.marginLeft,
    sevY + 16,
    w,
    fs.allBySeverity
  );
  setCursor(doc, sevY + 16 + barH + 14);

  doc
    .fontSize(PDF.type.sub)
    .fillColor(PDF.color.navy)
    .text("Lifecycle Status", PDF.page.marginLeft, doc.y, { lineBreak: false });
  setCursor(doc, doc.y + 14);

  const sc = fs.statusCounts ?? {
    validated: snapshot.validatedFindings.length,
    openObservations: snapshot.openObservations.length,
    acceptedRisks: snapshot.acceptedRisks.length,
    resolved: 0,
    falsePositives: 0,
  };

  const statusRows: Array<[string, number, string]> = [
    ["Validated Findings", sc.validated, PDF.color.accent],
    ["Scanner Observations Pending Review", sc.openObservations, PDF.color.warning],
    ["Accepted Risks", sc.acceptedRisks, PDF.color.medium],
    ["Resolved Findings", sc.resolved, PDF.color.success],
    ["False Positives", sc.falsePositives, PDF.color.info],
  ];

  for (const [label, count, color] of statusRows) {
    ensureSpace(doc, 22);
    const ry = doc.y;
    doc.circle(PDF.page.marginLeft + 4, ry + 5, 3).fill(color);
    doc
      .fontSize(9)
      .fillColor(PDF.color.ink)
      .text(`${label}  ${count}`, PDF.page.marginLeft + 14, ry, {
        width: w - 20,
        lineBreak: false,
      });
    setCursor(doc, ry + 16);
  }

  ensureSpace(doc, 30);
  drawSegmentedStatusBar(doc, PDF.page.marginLeft, doc.y, w, [
    { count: sc.validated, color: PDF.color.accent },
    { count: sc.openObservations, color: PDF.color.warning },
    { count: sc.acceptedRisks, color: PDF.color.medium },
    { count: sc.resolved, color: PDF.color.success },
    { count: sc.falsePositives, color: PDF.color.info },
  ]);
  setCursor(doc, doc.y + 24);

  drawBanner(
    doc,
    "Validated findings are analyst-confirmed. Scanner observations are automated detections pending review and must not be treated as confirmed vulnerabilities.",
    "info"
  );
}

function drawValidatedFindings(
  doc: PDFKit.PDFDocument,
  snapshot: SecurityPostureReportSnapshot
): void {
  sectionHeading(doc, "5", "Validated Findings");
  if (snapshot.validatedFindings.length === 0) {
    drawBanner(
      doc,
      "No analyst-validated findings were recorded within the reporting scope. This does not guarantee that systems are free from vulnerabilities.",
      "neutral"
    );
    return;
  }

  const w = contentWidth(doc);
  for (const f of snapshot.validatedFindings) {
    ensureSpace(doc, 100);
    const y = doc.y;
    const est =
      70 +
      (f.businessImpact ? 14 : 0) +
      (f.remediationGuidance ? 28 : 0) +
      (f.description ? 24 : 0);
    doc.roundedRect(PDF.page.marginLeft, y, w, est, 6).fill(PDF.color.white);
    doc
      .roundedRect(PDF.page.marginLeft, y, w, est, 6)
      .strokeColor(PDF.color.line)
      .lineWidth(0.8)
      .stroke();
    doc.rect(PDF.page.marginLeft, y, 4, est).fill(severityColor(f.severity));

    doc
      .fontSize(11)
      .fillColor(PDF.color.ink)
      .text(f.title, PDF.page.marginLeft + 14, y + 10, {
        width: w - 28,
        lineBreak: false,
      });
    const by = y + 28;
    const bw = severityBadge(doc, f.severity, PDF.page.marginLeft + 14, by);
    if (f.priority) {
      doc
        .roundedRect(PDF.page.marginLeft + 20 + bw, by, 70, 12, 3)
        .fill(PDF.color.navyMid);
      doc
        .fontSize(7)
        .fillColor(PDF.color.white)
        .text(`PRIORITY ${f.priority}`, PDF.page.marginLeft + 20 + bw, by + 2.5, {
          width: 70,
          align: "center",
          lineBreak: false,
        });
    }
    let ty = by + 18;
    doc
      .fontSize(8)
      .fillColor(PDF.color.inkMuted)
      .text(
        `Asset: ${f.assetName}  ·  Source: ${f.source}${f.cweId ? `  ·  CWE ${f.cweId}` : ""}  ·  Affected locations: ${f.instanceCount}  ·  Remediation: ${f.remediationStatus ?? "—"}`,
        PDF.page.marginLeft + 14,
        ty,
        { width: w - 28, height: 24, ellipsis: true }
      );
    ty += 28;
    if (f.businessImpact) {
      doc
        .fontSize(8)
        .fillColor(PDF.color.ink)
        .text(`Business impact: ${f.businessImpact}`, PDF.page.marginLeft + 14, ty, {
          width: w - 28,
          height: 20,
          ellipsis: true,
        });
      ty += 22;
    }
    if (f.remediationGuidance) {
      doc
        .fontSize(8)
        .fillColor(PDF.color.inkMuted)
        .text(`Guidance: ${f.remediationGuidance}`, PDF.page.marginLeft + 14, ty, {
          width: w - 28,
          height: 28,
          ellipsis: true,
        });
    }
    setCursor(doc, y + est + 10);
  }
}

function drawScannerObservations(
  doc: PDFKit.PDFDocument,
  snapshot: SecurityPostureReportSnapshot
): void {
  sectionHeading(doc, "6", "Scanner Observations");
  drawBanner(
    doc,
    "Scanner observations are automated detections that have not necessarily been validated by a security analyst. They may include false positives and should not be interpreted as confirmed vulnerabilities.",
    "warning"
  );

  const cols: TableColumn[] = [
    { key: "title", label: "Observation", width: 170 },
    { key: "sev", label: "Severity", width: 58 },
    { key: "src", label: "Source", width: 70 },
    { key: "conf", label: "Confidence", width: 58 },
    { key: "asset", label: "Asset", width: 90 },
    { key: "loc", label: "Locations", width: 52, align: "center" },
  ];

  if (snapshot.openObservations.length === 0) {
    doc
      .fontSize(PDF.type.body)
      .fillColor(PDF.color.inkFaint)
      .text("No open scanner observations in scope.");
    return;
  }

  let y = doc.y;
  const x = PDF.page.marginLeft;
  y += drawTableHeader(doc, cols, x, y);

  snapshot.openObservations.forEach((o, i) => {
    ensureSpace(doc, 26);
    if (doc.y <= PDF.page.marginTop + 2) {
      y = doc.y;
      y += drawTableHeader(doc, cols, x, y);
    }
    const h = drawTableRow(
      doc,
      cols,
      {
        title: o.title.length > 42 ? `${o.title.slice(0, 40)}…` : o.title,
        sev: o.severity,
        src: o.source.replace(/_/g, " "),
        conf: o.confidence ?? "—",
        asset: o.assetName.length > 22 ? `${o.assetName.slice(0, 20)}…` : o.assetName,
        loc: String(o.instanceCount),
      },
      x,
      y,
      i % 2 === 1,
      { severityKey: "sev" }
    );
    y += h;
    setCursor(doc, y);
  });
  setCursor(doc, y + 8);
}

function drawAcceptedRisks(
  doc: PDFKit.PDFDocument,
  snapshot: SecurityPostureReportSnapshot
): void {
  sectionHeading(doc, "7", "Accepted Risks");
  if (snapshot.acceptedRisks.length === 0) {
    doc
      .fontSize(PDF.type.body)
      .fillColor(PDF.color.inkFaint)
      .text("No accepted risks were recorded within the reporting scope.");
    return;
  }

  drawBanner(
    doc,
    "Accepted risks remain represented in posture scoring with residual impact. Acceptance is not equivalent to remediation.",
    "neutral"
  );

  const cols: TableColumn[] = [
    { key: "title", label: "Finding", width: 120 },
    { key: "sev", label: "Severity", width: 58 },
    { key: "asset", label: "Asset", width: 80 },
    { key: "reason", label: "Reason", width: 110 },
    { key: "by", label: "Approved By", width: 70 },
    { key: "at", label: "Approved", width: 58 },
    { key: "rev", label: "Review", width: 50 },
  ];

  let y = doc.y;
  const x = PDF.page.marginLeft;
  y += drawTableHeader(doc, cols, x, y);

  snapshot.acceptedRisks.forEach((r, i) => {
    ensureSpace(doc, 26);
    if (doc.y <= PDF.page.marginTop + 2) {
      y = doc.y;
      y += drawTableHeader(doc, cols, x, y);
    }
    const h = drawTableRow(
      doc,
      cols,
      {
        title: r.title.length > 28 ? `${r.title.slice(0, 26)}…` : r.title,
        sev: r.severity,
        asset: r.assetName.length > 18 ? `${r.assetName.slice(0, 16)}…` : r.assetName,
        reason: (r.reason ?? "—").length > 28 ? `${(r.reason ?? "").slice(0, 26)}…` : r.reason ?? "—",
        by: r.approvedBy ?? "—",
        at: r.approvedAt ? fmtDate(r.approvedAt) : "—",
        rev: r.reviewDate ? fmtDate(r.reviewDate) : "—",
      },
      x,
      y,
      i % 2 === 1,
      { severityKey: "sev" }
    );
    y += h;
    setCursor(doc, y);
  });
  setCursor(doc, y + 8);
}

function drawRemediation(
  doc: PDFKit.PDFDocument,
  snapshot: SecurityPostureReportSnapshot
): void {
  sectionHeading(doc, "8", "Remediation Status");
  const rem = snapshot.remediation;
  const w = contentWidth(doc);
  const gap = 8;
  const cw = (w - gap * 4) / 5;
  let x = PDF.page.marginLeft;
  const y = doc.y;
  const items: Array<[string, number, string]> = [
    ["Open", rem.open, PDF.color.accent],
    ["In Progress", rem.inProgress, PDF.color.warning],
    ["Blocked", rem.blocked, PDF.color.danger],
    ["Completed", rem.completed, PDF.color.success],
    ["Overdue", rem.overdue, PDF.color.critical],
  ];
  items.forEach(([label, n, color]) => {
    drawKpiCard(doc, x, y, cw, 56, label, String(n), color);
    x += cw + gap;
  });
  setCursor(doc, y + 68);

  const pct =
    rem.total === 0 ? 0 : Math.round((rem.completed / rem.total) * 100);
  doc
    .fontSize(PDF.type.sub)
    .fillColor(PDF.color.navy)
    .text(
      `Remediation Completion — ${rem.completed} / ${rem.total} Completed (${pct}%)`,
      PDF.page.marginLeft,
      doc.y,
      { lineBreak: false }
    );
  setCursor(doc, doc.y + 14);
  drawProgressBar(doc, PDF.page.marginLeft, doc.y, w, pct);
  setCursor(doc, doc.y + 22);

  if (rem.tasks.length === 0) {
    doc
      .fontSize(PDF.type.body)
      .fillColor(PDF.color.inkFaint)
      .text("No remediation tasks in scope.");
    return;
  }

  const cols: TableColumn[] = [
    { key: "finding", label: "Finding", width: 150 },
    { key: "sev", label: "Severity", width: 58 },
    { key: "pri", label: "Priority", width: 52 },
    { key: "status", label: "Status", width: 70 },
    { key: "who", label: "Assigned To", width: 90 },
    { key: "due", label: "Due Date", width: 70 },
  ];

  let ty = doc.y;
  const tx = PDF.page.marginLeft;
  ty += drawTableHeader(doc, cols, tx, ty);

  rem.tasks.forEach((t, i) => {
    ensureSpace(doc, 26);
    if (doc.y <= PDF.page.marginTop + 2) {
      ty = doc.y;
      ty += drawTableHeader(doc, cols, tx, ty);
    }
    const title = t.findingTitle ?? t.title;
    const h = drawTableRow(
      doc,
      cols,
      {
        finding: title.length > 36 ? `${title.slice(0, 34)}…` : title,
        sev: t.severity ?? "—",
        pri: t.priority,
        status: t.status.replace(/_/g, " "),
        who: t.assignedTo ?? "Unassigned",
        due: t.dueDate ? fmtDate(t.dueDate) : "—",
      },
      tx,
      ty,
      i % 2 === 1,
      { severityKey: t.severity ? "sev" : undefined }
    );
    ty += h;
    setCursor(doc, ty);
  });
  setCursor(doc, ty + 8);
}

function drawScoreTrend(
  doc: PDFKit.PDFDocument,
  snapshot: SecurityPostureReportSnapshot
): void {
  sectionHeading(doc, "9", "Score Trend");
  if (snapshot.scoreTrendInsufficient || snapshot.scoreTrend.length < 2) {
    drawBanner(
      doc,
      "Insufficient historical data to display a meaningful posture trend.",
      "neutral"
    );
    return;
  }

  const points = prepareTrendPoints(snapshot.scoreTrend);
  const w = contentWidth(doc);
  ensureSpace(doc, 200);
  const chartY = doc.y;
  doc
    .roundedRect(PDF.page.marginLeft, chartY, w, 180, 8)
    .fill(PDF.color.surface);
  drawLineChart(
    doc,
    PDF.page.marginLeft + 8,
    chartY + 8,
    w - 16,
    164,
    points.map((p) => ({ score: p.score, label: p.label }))
  );
  setCursor(doc, chartY + 190);
  doc
    .fontSize(PDF.type.caption)
    .fillColor(PDF.color.inkFaint)
    .text(
      "Trend uses SecurityScoreSnapshot history for the reporting period only. Same-day points are ordered by timestamp; dense series may be sampled for readability.",
      PDF.page.marginLeft,
      doc.y,
      { width: w }
    );
  setCursor(doc, doc.y + 8);
}

function drawMethodology(
  doc: PDFKit.PDFDocument,
  snapshot: SecurityPostureReportSnapshot
): void {
  sectionHeading(doc, "10", "Assessment Methodology");
  const m = snapshot.methodology;
  const w = contentWidth(doc);
  const cards: Array<{ show: boolean; title: string; items: string[] }> = [
    {
      show: m.passiveChecksUsed,
      title: "Passive Website Security Checks",
      items: [
        "HTTPS availability",
        "TLS certificate configuration",
        "Security headers",
        "Cookie security observations",
      ],
    },
    {
      show: m.zapBaselineUsed,
      title: "OWASP ZAP Baseline",
      items: [
        "Passive web application analysis",
        "Automated crawling",
        "Passive scanner rules",
        "No active exploitation",
      ],
    },
    {
      show: m.analystTriageUsed,
      title: "Analyst Triage",
      items: [
        "Finding validation",
        "False-positive handling",
        "Risk acceptance",
        "Remediation workflow",
      ],
    },
  ];

  const shown = cards.filter((c) => c.show);
  if (shown.length === 0) {
    for (const line of m.methods) {
      ensureSpace(doc, 20);
      doc
        .fontSize(PDF.type.body)
        .fillColor(PDF.color.inkMuted)
        .text(`• ${line}`, PDF.page.marginLeft, doc.y, {
          width: w,
          lineBreak: true,
        });
      setCursor(doc, doc.y + 6);
    }
    return;
  }

  for (const card of shown) {
    ensureSpace(doc, 90);
    const y = doc.y;
    doc.roundedRect(PDF.page.marginLeft, y, w, 82, 6).fill(PDF.color.white);
    doc
      .roundedRect(PDF.page.marginLeft, y, w, 82, 6)
      .strokeColor(PDF.color.line)
      .lineWidth(0.8)
      .stroke();
    doc.rect(PDF.page.marginLeft, y, 4, 82).fill(PDF.color.accent);
    doc
      .fontSize(11)
      .fillColor(PDF.color.navy)
      .text(card.title, PDF.page.marginLeft + 14, y + 12, { lineBreak: false });
    let iy = y + 32;
    for (const item of card.items) {
      doc
        .fontSize(8.5)
        .fillColor(PDF.color.inkMuted)
        .text(`•  ${item}`, PDF.page.marginLeft + 14, iy, { lineBreak: false });
      iy += 12;
    }
    setCursor(doc, y + 92);
  }
}

function drawLimitations(
  doc: PDFKit.PDFDocument,
  snapshot: SecurityPostureReportSnapshot
): void {
  sectionHeading(doc, "11", "Limitations");
  const w = contentWidth(doc);
  ensureSpace(doc, 160);
  const y = doc.y;
  const rowH = 28;
  const boxH = 16 + snapshot.limitations.length * rowH;
  doc.roundedRect(PDF.page.marginLeft, y, w, boxH, 6).fill(PDF.color.surfaceAlt);
  doc
    .roundedRect(PDF.page.marginLeft, y, w, boxH, 6)
    .strokeColor(PDF.color.line)
    .lineWidth(0.8)
    .stroke();
  doc.rect(PDF.page.marginLeft, y, 4, boxH).fill(PDF.color.navyMid);

  snapshot.limitations.forEach((l, i) => {
    doc
      .fontSize(PDF.type.body)
      .fillColor(PDF.color.inkMuted)
      .text(`• ${l}`, PDF.page.marginLeft + 14, y + 12 + i * rowH, {
        width: w - 28,
        height: rowH - 4,
        ellipsis: true,
      });
  });
  setCursor(doc, y + boxH + 12);
}
