import PDFDocument from "pdfkit";
import {
  applyContentMargins,
  drawBanner,
  drawKpiCard,
  drawTableHeader,
  drawTableRow,
  ensureSpace,
  sectionHeading,
  setCursor,
  type TableColumn,
} from "@/services/reports/pdf/primitives";
import { PDF, contentWidth } from "@/services/reports/pdf/theme";
import { formatReportDateTime } from "@/services/reporting/shared/date-helpers";
import { displayCell } from "@/services/reporting/shared/formatters";
import type { FrameworkReportDocument, ReportTable } from "@/types/reporting-framework";

const MAX_TABLE_ROWS = 80;

function allocateColumnWidths(
  doc: PDFKit.PDFDocument,
  columns: ReportTable["columns"]
): TableColumn[] {
  const total = contentWidth(doc);
  const n = Math.max(columns.length, 1);
  const base = Math.floor(total / n);
  let remaining = total - base * n;
  return columns.map((c, i) => {
    const extra = i < remaining ? 1 : 0;
    return {
      key: c.key,
      label: c.label,
      width: base + extra,
    };
  });
}

function renderTable(doc: PDFKit.PDFDocument, table: ReportTable): void {
  ensureSpace(doc, 40);
  doc
    .fontSize(PDF.type.sub)
    .fillColor(PDF.color.navy)
    .text(table.title, PDF.page.marginLeft, doc.y, {
      width: contentWidth(doc),
    });
  setCursor(doc, doc.y + 8);

  const columns = allocateColumnWidths(doc, table.columns);
  const x = PDF.page.marginLeft;
  let y = doc.y;
  const headerH = drawTableHeader(doc, columns, x, y);
  y += headerH;

  const rows = table.rows.slice(0, MAX_TABLE_ROWS);
  rows.forEach((row, idx) => {
    ensureSpace(doc, 24);
    if (doc.y !== y && idx > 0) {
      // page break reset
      y = doc.y;
      drawTableHeader(doc, columns, x, y);
      y += 22;
    }
    const values: Record<string, string> = {};
    for (const col of columns) {
      values[col.key] = displayCell(row[col.key]);
    }
    const severityKey = columns.some((c) => c.key === "severity")
      ? "severity"
      : undefined;
    const h = drawTableRow(doc, columns, values, x, y, idx % 2 === 1, {
      severityKey,
    });
    y += h;
    setCursor(doc, y);
  });

  if (table.rows.length > MAX_TABLE_ROWS) {
    drawBanner(
      doc,
      `Showing first ${MAX_TABLE_ROWS} of ${table.rows.length} rows. Export CSV for the full dataset.`,
      "neutral"
    );
  } else {
    setCursor(doc, y + 10);
  }
}

/**
 * Reusable PDFKit renderer for framework report documents.
 * No HTML print path — vector text/tables only.
 */
export async function renderFrameworkReportPdf(
  report: FrameworkReportDocument
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
        Title: report.title,
        Author: "ClientShield",
        Subject: report.kind,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    applyContentMargins(doc);

    // Cover / header
    doc
      .fontSize(PDF.type.coverBrand)
      .fillColor(PDF.color.accent)
      .text("CLIENTSHIELD", PDF.page.marginLeft, PDF.page.marginTop, {
        width: contentWidth(doc),
        lineBreak: false,
      });
    setCursor(doc, doc.y + 18);

    doc
      .fontSize(PDF.type.coverTitle)
      .fillColor(PDF.color.navy)
      .text(report.title, {
        width: contentWidth(doc),
      });
    setCursor(doc, doc.y + 8);

    doc
      .fontSize(PDF.type.body)
      .fillColor(PDF.color.inkMuted)
      .text(`Organisation: ${report.organizationName}`, {
        width: contentWidth(doc),
      });
    doc.text(`Generated: ${formatReportDateTime(report.generatedAt)}`, {
      width: contentWidth(doc),
    });
    doc.text(`Report type: ${report.kind.replace(/_/g, " ")}`, {
      width: contentWidth(doc),
    });
    setCursor(doc, doc.y + 14);

    drawBanner(doc, report.summary, "info");

    // Sections
    report.sections.forEach((section, idx) => {
      sectionHeading(doc, String(idx + 1), section.title);

      if (section.summary) {
        doc
          .fontSize(PDF.type.body)
          .fillColor(PDF.color.ink)
          .text(section.summary, {
            width: contentWidth(doc),
          });
        setCursor(doc, doc.y + 8);
      }

      if (section.kpis && section.kpis.length > 0) {
        ensureSpace(doc, 70);
        const gap = 10;
        const cardW =
          (contentWidth(doc) - gap * (Math.min(section.kpis.length, 4) - 1)) /
          Math.min(section.kpis.length, 4);
        const cardH = 56;
        let x = PDF.page.marginLeft;
        const y = doc.y;
        section.kpis.slice(0, 4).forEach((kpi) => {
          drawKpiCard(doc, x, y, cardW, cardH, kpi.label, kpi.value);
          x += cardW + gap;
        });
        setCursor(doc, y + cardH + 12);
      }

      if (section.bullets && section.bullets.length > 0) {
        for (const bullet of section.bullets) {
          ensureSpace(doc, 16);
          doc
            .fontSize(PDF.type.body)
            .fillColor(PDF.color.ink)
            .text(`•  ${bullet}`, {
              width: contentWidth(doc),
            });
        }
        setCursor(doc, doc.y + 8);
      }

      if (section.tables) {
        for (const table of section.tables) {
          renderTable(doc, table);
        }
      }
    });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const pageNo = i - range.start + 1;
      doc
        .fontSize(PDF.type.caption)
        .fillColor(PDF.color.inkFaint)
        .text(
          `${report.organizationName} · Page ${pageNo} of ${range.count}`,
          PDF.page.marginLeft,
          doc.page.height - PDF.page.marginBottom + 8,
          { width: contentWidth(doc), align: "center", lineBreak: false }
        );
    }

    doc.end();
  });
}
