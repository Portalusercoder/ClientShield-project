import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Report file storage abstraction.
 * Local MVP stores under storage/reports/{organizationId}/...
 * Later: swap for S3 / Azure Blob / R2 without changing callers.
 */

const STORAGE_ROOT = path.resolve(
  process.env.REPORT_STORAGE_ROOT ||
    path.join(process.cwd(), "storage", "reports")
);

export function getReportStorageRoot(): string {
  return STORAGE_ROOT;
}

/**
 * Build a safe storage key — never accept user-supplied filesystem paths.
 */
export function buildReportStorageKey(input: {
  organizationId: string;
  reportId: string;
  version: number;
}): string {
  const safeOrg = input.organizationId.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeId = input.reportId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.posix.join(
    safeOrg,
    `${safeId}_v${input.version}.pdf`
  );
}

export async function saveReportPdf(
  storageKey: string,
  buffer: Buffer
): Promise<void> {
  assertSafeStorageKey(storageKey);
  const fullPath = resolveStoragePath(storageKey);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
}

export async function readReportPdf(storageKey: string): Promise<Buffer> {
  assertSafeStorageKey(storageKey);
  const fullPath = resolveStoragePath(storageKey);
  return readFile(fullPath);
}

/** Exported for tests — never accept user-supplied filesystem paths. */
export function assertSafeStorageKey(storageKey: string): void {
  if (
    !storageKey ||
    storageKey.includes("..") ||
    storageKey.startsWith("/") ||
    storageKey.includes("\\")
  ) {
    throw new Error("Invalid report storage key");
  }
}

function resolveStoragePath(storageKey: string): string {
  const full = path.resolve(STORAGE_ROOT, storageKey);
  if (!full.startsWith(STORAGE_ROOT)) {
    throw new Error("Path traversal blocked");
  }
  return full;
}
