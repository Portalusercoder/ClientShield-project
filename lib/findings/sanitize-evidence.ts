/**
 * Sanitizes finding evidence before display or persistence.
 * Strips secrets, tokens, passwords, and cookie values.
 */

const SENSITIVE_KEY =
  /^(authorization|cookie|set-cookie|password|passwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|session|csrf|x-api-key|bearer)$/i;

const SENSITIVE_VALUE =
  /(bearer\s+[a-z0-9._\-]+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+|password\s*[:=]|api[_-]?key\s*[:=])/i;

export function sanitizeEvidence(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string") {
    if (SENSITIVE_VALUE.test(value)) return "[REDACTED]";
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeEvidence(item));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitizeEvidence(nested);
      }
    }
    return out;
  }
  return null;
}

export function formatEvidenceForDisplay(value: unknown): string {
  const sanitized = sanitizeEvidence(value);
  if (sanitized == null) return "No evidence recorded.";
  try {
    return JSON.stringify(sanitized, null, 2);
  } catch {
    return "Evidence unavailable.";
  }
}
