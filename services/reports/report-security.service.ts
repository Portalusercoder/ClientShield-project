import { sanitizeEvidence } from "@/lib/findings/sanitize-evidence";

/**
 * Report-specific sanitization. Never include secrets in snapshots/PDFs.
 */
const FORBIDDEN_KEYS = new Set([
  "cookie",
  "cookies",
  "authorization",
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "set-cookie",
  "session",
  "jwt",
  "bearer",
]);

export function sanitizeReportText(
  value: string | null | undefined,
  max = 2000
): string | null {
  if (!value) return null;
  let text = value.trim();
  // Authorization: Bearer <token>
  text = text.replace(
    /(authorization)\s*[:=]\s*bearer\s+[^\s,;]+/gi,
    "$1: [REDACTED]"
  );
  text = text.replace(
    /(authorization|cookie|set-cookie|password|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
    "$1: [REDACTED]"
  );
  if (text.length > max) text = `${text.slice(0, max)}…`;
  return text;
}

export function sanitizeReportEvidence(evidence: unknown): unknown {
  return sanitizeEvidence(evidence);
}

export function stripForbiddenKeys(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_KEYS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export function extractSafeConfidence(evidence: unknown): string | null {
  if (!evidence || typeof evidence !== "object") return null;
  const e = evidence as Record<string, unknown>;
  return typeof e.confidence === "string" ? e.confidence : null;
}

export function extractSafeCwe(evidence: unknown): string | null {
  if (!evidence || typeof evidence !== "object") return null;
  const e = evidence as Record<string, unknown>;
  if (typeof e.cweId === "string") return e.cweId;
  if (typeof e.cweid === "string") return e.cweid;
  return null;
}
