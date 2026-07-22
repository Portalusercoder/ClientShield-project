import { PDF, contentWidth, severityColor } from "@/services/reports/pdf/theme";
import type { ReportFindingCounts } from "@/types/reports";

export function drawScoreGauge(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  size: number,
  score: number | null
): void {
  const cx = x + size / 2;
  const cy = y + size / 2 + 4;
  const r = size / 2 - 8;
  const start = -Math.PI * 0.75;
  const end = Math.PI * 0.75;
  const value = score == null ? 0 : Math.max(0, Math.min(100, score));
  const mid = start + ((end - start) * value) / 100;

  // Track
  doc.save();
  doc
    .lineWidth(10)
    .strokeColor(PDF.color.line)
    .path(arcPath(cx, cy, r, start, end))
    .stroke();

  if (score != null) {
    const color =
      score >= 80
        ? PDF.color.success
        : score >= 60
          ? PDF.color.accent
          : score >= 40
            ? PDF.color.warning
            : PDF.color.danger;
    doc
      .lineWidth(10)
      .lineCap("round")
      .strokeColor(color)
      .path(arcPath(cx, cy, r, start, mid))
      .stroke();
  }
  doc.restore();

  doc
    .fontSize(PDF.type.scoreHero)
    .fillColor(PDF.color.ink)
    .text(score == null ? "—" : String(Math.round(score)), x, cy - 28, {
      width: size,
      align: "center",
      lineBreak: false,
    });
  doc
    .fontSize(PDF.type.caption)
    .fillColor(PDF.color.inkFaint)
    .text(score == null ? "Not Assessed" : "/ 100", x, cy + 18, {
      width: size,
      align: "center",
      lineBreak: false,
    });
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  start: number,
  end: number
): string {
  const steps = 48;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = start + ((end - start) * i) / steps;
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  return d;
}

export function drawHorizontalSeverityBars(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  counts: ReportFindingCounts
): number {
  const rows: Array<{ label: string; count: number; color: string }> = [
    { label: "Critical", count: counts.critical, color: severityColor("CRITICAL") },
    { label: "High", count: counts.high, color: severityColor("HIGH") },
    { label: "Medium", count: counts.medium, color: severityColor("MEDIUM") },
    { label: "Low", count: counts.low, color: severityColor("LOW") },
    { label: "Informational", count: counts.info, color: severityColor("INFO") },
  ];
  const max = Math.max(1, ...rows.map((r) => r.count));
  let cy = y;
  const barMax = width - 110;

  for (const row of rows) {
    doc.fontSize(8).fillColor(PDF.color.inkMuted).text(row.label, x, cy + 1, {
      width: 78,
      lineBreak: false,
    });
    const bw = (row.count / max) * barMax;
    doc
      .roundedRect(x + 82, cy, Math.max(bw, row.count > 0 ? 4 : 0), 10, 2)
      .fill(row.color);
    doc
      .fontSize(8)
      .fillColor(PDF.color.ink)
      .text(String(row.count), x + 82 + Math.max(bw, 0) + 6, cy + 1, {
        lineBreak: false,
      });
    cy += 18;
  }
  return cy - y;
}

export function drawLineChart(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  points: Array<{ score: number; label: string }>
): void {
  if (points.length < 2) return;

  const padL = 28;
  const padB = 28;
  const padT = 8;
  const padR = 8;
  const plotX = x + padL;
  const plotY = y + padT;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  // Axes
  doc
    .strokeColor(PDF.color.line)
    .lineWidth(1)
    .moveTo(plotX, plotY)
    .lineTo(plotX, plotY + plotH)
    .lineTo(plotX + plotW, plotY + plotH)
    .stroke();

  // Y ticks 0/50/100
  for (const tick of [0, 50, 100]) {
    const ty = plotY + plotH - (tick / 100) * plotH;
    doc
      .fontSize(7)
      .fillColor(PDF.color.inkFaint)
      .text(String(tick), x, ty - 4, {
        width: padL - 4,
        align: "right",
        lineBreak: false,
      });
    doc
      .strokeColor(PDF.color.lineSoft)
      .lineWidth(0.5)
      .moveTo(plotX, ty)
      .lineTo(plotX + plotW, ty)
      .stroke();
  }

  const coords = points.map((p, i) => {
    const px =
      points.length === 1
        ? plotX + plotW / 2
        : plotX + (i / (points.length - 1)) * plotW;
    const py = plotY + plotH - (Math.max(0, Math.min(100, p.score)) / 100) * plotH;
    return { px, py, ...p };
  });

  doc.save();
  doc.strokeColor(PDF.color.accent).lineWidth(2);
  doc.moveTo(coords[0]!.px, coords[0]!.py);
  for (let i = 1; i < coords.length; i++) {
    doc.lineTo(coords[i]!.px, coords[i]!.py);
  }
  doc.stroke();

  for (const c of coords) {
    doc.circle(c.px, c.py, 2.5).fill(PDF.color.accent);
  }

  // Current marker (last)
  const last = coords[coords.length - 1]!;
  doc.circle(last.px, last.py, 4.5).fill(PDF.color.navy);
  doc.circle(last.px, last.py, 2.5).fill(PDF.color.accent);

  // X labels (first, mid, last)
  const labelIdx = [
    0,
    Math.floor(coords.length / 2),
    coords.length - 1,
  ].filter((v, i, a) => a.indexOf(v) === i);

  for (const i of labelIdx) {
    const c = coords[i]!;
    doc
      .fontSize(6.5)
      .fillColor(PDF.color.inkFaint)
      .text(c.label, c.px - 28, plotY + plotH + 6, {
        width: 56,
        align: "center",
        lineBreak: false,
      });
  }
  doc.restore();
}

export function drawProgressBar(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  pct: number,
  color = PDF.color.success
): void {
  const p = Math.max(0, Math.min(100, pct));
  doc.roundedRect(x, y, width, 10, 4).fill(PDF.color.lineSoft);
  if (p > 0) {
    doc.roundedRect(x, y, Math.max(8, (width * p) / 100), 10, 4).fill(color);
  }
}

export function drawSegmentedStatusBar(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  segments: Array<{ count: number; color: string }>
): void {
  const total = segments.reduce((s, seg) => s + seg.count, 0) || 1;
  let cx = x;
  doc.roundedRect(x, y, width, 12, 3).fill(PDF.color.lineSoft);
  for (const seg of segments) {
    if (seg.count <= 0) continue;
    const w = (seg.count / total) * width;
    doc.rect(cx, y, w, 12).fill(seg.color);
    cx += w;
  }
}

export { contentWidth };
