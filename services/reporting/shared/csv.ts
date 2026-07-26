import { cell } from "@/services/reporting/shared/formatters";
import type { ReportTable } from "@/types/reporting-framework";

/** Escape a CSV field per RFC 4180 subset. */
export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function rowsToCsv(
  columns: Array<{ key: string; label: string }>,
  rows: Record<string, string | number | null>[]
): string {
  const header = columns.map((c) => escapeCsvField(c.label)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeCsvField(cell(row[c.key]))).join(",")
  );
  return [header, ...body].join("\n") + "\n";
}

/** Prefer the first table; otherwise concatenate labeled tables. */
export function reportTablesToCsv(tables: ReportTable[]): string {
  if (tables.length === 0) {
    return "message\nNo tabular data for this report\n";
  }
  if (tables.length === 1) {
    return rowsToCsv(tables[0].columns, tables[0].rows);
  }
  const parts: string[] = [];
  for (const table of tables) {
    parts.push(escapeCsvField(`# ${table.title}`));
    parts.push(rowsToCsv(table.columns, table.rows).trimEnd());
    parts.push("");
  }
  return parts.join("\n") + "\n";
}
