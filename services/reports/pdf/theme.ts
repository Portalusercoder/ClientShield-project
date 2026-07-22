/**
 * ClientShield Security Posture Report — PDF design tokens.
 * Aligns with dashboard: accent #3b82f6, navy surfaces, severity palette.
 */

export const PDF = {
  page: {
    marginLeft: 48,
    marginRight: 48,
    marginTop: 64,
    marginBottom: 52,
  },
  color: {
    navy: "#0a1628",
    navyMid: "#12243d",
    accent: "#3b82f6",
    accentSoft: "#dbeafe",
    ink: "#0f172a",
    inkMuted: "#475569",
    inkFaint: "#64748b",
    line: "#e2e8f0",
    lineSoft: "#f1f5f9",
    white: "#ffffff",
    surface: "#f8fafc",
    surfaceAlt: "#f1f5f9",
    success: "#16a34a",
    successSoft: "#dcfce7",
    warning: "#d97706",
    warningSoft: "#fef3c7",
    danger: "#dc2626",
    dangerSoft: "#fee2e2",
    confidential: "#b45309",
    critical: "#dc2626",
    high: "#ea580c",
    medium: "#ca8a04",
    low: "#2563eb",
    info: "#64748b",
  },
  type: {
    coverBrand: 11,
    coverTitle: 28,
    coverClient: 18,
    section: 16,
    sub: 11,
    body: 9.5,
    caption: 8,
    kpiValue: 22,
    scoreHero: 42,
  },
} as const;

export function severityColor(severity: string): string {
  switch (severity.toUpperCase()) {
    case "CRITICAL":
      return PDF.color.critical;
    case "HIGH":
      return PDF.color.high;
    case "MEDIUM":
      return PDF.color.medium;
    case "LOW":
      return PDF.color.low;
    default:
      return PDF.color.info;
  }
}

export function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - PDF.page.marginLeft - PDF.page.marginRight;
}
