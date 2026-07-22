import { PDF, contentWidth, severityColor } from "@/services/reports/pdf/theme";

export function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const bottom = doc.page.height - PDF.page.marginBottom - 8;
  if (doc.y + needed > bottom) {
    doc.addPage();
    doc.y = PDF.page.marginTop;
  }
}

export function newSectionPage(doc: PDFKit.PDFDocument): void {
  doc.addPage();
  doc.y = PDF.page.marginTop;
}

/** Reset flow cursor after absolute-position drawing to avoid PDFKit page storms. */
export function setCursor(doc: PDFKit.PDFDocument, y: number): void {
  doc.x = PDF.page.marginLeft;
  doc.y = y;
}

export function sectionHeading(
  doc: PDFKit.PDFDocument,
  number: string,
  title: string
): void {
  ensureSpace(doc, 48);
  const x = PDF.page.marginLeft;
  const y = doc.y;
  doc.roundedRect(x, y, 4, 18, 1).fill(PDF.color.accent);
  doc
    .fontSize(PDF.type.section)
    .fillColor(PDF.color.navy)
    .text(`${number}.  ${title}`, x + 14, y, {
      width: contentWidth(doc) - 14,
      lineBreak: false,
    });
  setCursor(doc, y + 26);
}

export function drawKpiCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  accent: string = PDF.color.accent
): void {
  doc.roundedRect(x, y, w, h, 6).fill(PDF.color.surface);
  doc.roundedRect(x, y, w, h, 6).strokeColor(PDF.color.line).lineWidth(0.8).stroke();
  doc.rect(x, y, 4, h).fill(accent);
  doc
    .fontSize(PDF.type.caption)
    .fillColor(PDF.color.inkFaint)
    .text(label.toUpperCase(), x + 14, y + 10, {
      width: w - 22,
      lineBreak: false,
    });
  doc
    .fontSize(PDF.type.kpiValue)
    .fillColor(PDF.color.ink)
    .text(value, x + 14, y + 26, {
      width: w - 22,
      lineBreak: false,
    });
}

export function drawBanner(
  doc: PDFKit.PDFDocument,
  text: string,
  tone: "info" | "warning" | "neutral" = "info"
): void {
  const width = contentWidth(doc);
  const x = PDF.page.marginLeft;
  doc.fontSize(PDF.type.caption);
  const textH = doc.heightOfString(text, { width: width - 24 });
  const h = textH + 16;
  ensureSpace(doc, h + 12);
  const y = doc.y;
  const bg =
    tone === "warning"
      ? PDF.color.warningSoft
      : tone === "neutral"
        ? PDF.color.surfaceAlt
        : PDF.color.accentSoft;
  const border =
    tone === "warning"
      ? PDF.color.warning
      : tone === "neutral"
        ? PDF.color.line
        : PDF.color.accent;
  doc.roundedRect(x, y, width, h, 4).fill(bg);
  doc
    .roundedRect(x, y, width, h, 4)
    .strokeColor(border)
    .lineWidth(0.8)
    .stroke();
  doc
    .fontSize(PDF.type.caption)
    .fillColor(PDF.color.inkMuted)
    .text(text, x + 12, y + 8, {
      width: width - 24,
      height: Math.max(10, h - 12),
      ellipsis: true,
    });
  setCursor(doc, y + h + 10);
}

export function severityBadge(
  doc: PDFKit.PDFDocument,
  severity: string,
  x: number,
  y: number
): number {
  const label = severity.toUpperCase();
  const color = severityColor(severity);
  const w = Math.max(48, doc.widthOfString(label) + 12);
  doc.roundedRect(x, y, w, 12, 3).fill(color);
  doc
    .fontSize(7)
    .fillColor(PDF.color.white)
    .text(label, x, y + 2.5, { width: w, align: "center", lineBreak: false });
  return w;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export type TableColumn = {
  key: string;
  label: string;
  width: number;
  align?: "left" | "center" | "right";
};

export function drawTableHeader(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  x: number,
  y: number
): number {
  const h = 22;
  doc.rect(x, y, columns.reduce((s, c) => s + c.width, 0), h).fill(PDF.color.navy);
  let cx = x;
  for (const col of columns) {
    doc
      .fontSize(7.5)
      .fillColor(PDF.color.white)
      .text(col.label, cx + 4, y + 7, {
        width: col.width - 8,
        align: col.align ?? "left",
        lineBreak: false,
      });
    cx += col.width;
  }
  return h;
}

export function drawTableRow(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  values: Record<string, string>,
  x: number,
  y: number,
  alt: boolean,
  opts?: { severityKey?: string; rowHeight?: number }
): number {
  const h = opts?.rowHeight ?? 20;
  const totalW = columns.reduce((s, c) => s + c.width, 0);
  doc
    .rect(x, y, totalW, h)
    .fill(alt ? PDF.color.surfaceAlt : PDF.color.white);
  doc
    .rect(x, y, totalW, h)
    .strokeColor(PDF.color.line)
    .lineWidth(0.4)
    .stroke();

  let cx = x;
  for (const col of columns) {
    const raw = values[col.key] ?? "—";
    if (opts?.severityKey === col.key) {
      severityBadge(doc, raw, cx + 4, y + 4);
    } else {
      doc
        .fontSize(7.5)
        .fillColor(PDF.color.ink)
        .text(raw, cx + 4, y + 6, {
          width: col.width - 8,
          align: col.align ?? "left",
          lineBreak: false,
          ellipsis: true,
        });
    }
    cx += col.width;
  }
  return h;
}

export function applyContentMargins(doc: PDFKit.PDFDocument): void {
  doc.page.margins = {
    top: PDF.page.marginTop,
    bottom: PDF.page.marginBottom,
    left: PDF.page.marginLeft,
    right: PDF.page.marginRight,
  };
}
