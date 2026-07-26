/**
 * Secret redaction for log payloads (Phase 6P2).
 */

const SENSITIVE_KEY =
  /^(password|passwd|secret|token|authorization|api[_-]?key|cookie|credential|private[_-]?key|database_url|auth_secret|client_secret)$/i;

const SENSITIVE_VALUE =
  /(postgresql:\/\/[^\s]+|Bearer\s+[A-Za-z0-9\-._~+/]+=*|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i;

export function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string" && SENSITIVE_VALUE.test(value)) {
    return "[REDACTED]";
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => redactValue(String(i), v));
  }
  if (value && typeof value === "object") {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

export function redactObject(
  input: Record<string, unknown> | undefined | null
): Record<string, unknown> {
  if (!input) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = redactValue(k, v);
  }
  return out;
}
