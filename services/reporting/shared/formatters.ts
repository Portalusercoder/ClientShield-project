/** Lightweight text formatters for report tables / CSV. */
export function cell(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value).replace(/\r?\n/g, " ").trim();
}

export function displayCell(value: unknown): string {
  const s = cell(value);
  return s === "" ? "—" : s;
}

export function joinList(values: Array<string | null | undefined>, sep = "; "): string {
  return values.filter((v): v is string => Boolean(v && String(v).trim())).join(sep);
}
