/** Shared date helpers for on-demand reports. */
export function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  if (date.toISOString().length === 10 || !date.toISOString().includes("T")) {
    d.setHours(23, 59, 59, 999);
  }
  return d;
}

/** Inclusive date range from filter strings (YYYY-MM-DD or ISO). */
export function resolveDateRange(filters: {
  dateFrom?: string | null;
  dateTo?: string | null;
}): { from: Date | null; to: Date | null } {
  const from = parseOptionalDate(filters.dateFrom ?? undefined);
  let to = parseOptionalDate(filters.dateTo ?? undefined);
  if (to && filters.dateTo && filters.dateTo.length === 10) {
    to = endOfDay(to);
  }
  return { from, to };
}

export function formatReportDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function formatReportDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

export function msToHuman(ms: number | null | undefined): string {
  if (ms == null) return "N/A";
  const hours = ms / 3_600_000;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}
