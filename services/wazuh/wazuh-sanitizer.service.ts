/**
 * Sanitize Wazuh alert payloads before persistence.
 * Prefer allowlisted investigation fields; redact secrets aggressively.
 */

const FORBIDDEN_KEY_PATTERN =
  /pass(word)?|passwd|secret|token|apikey|api[_-]?key|authorization|cookie|set-cookie|session|jwt|bearer|private[_-]?key|credential/i;

const ALLOWED_TOP_LEVEL = new Set([
  "timestamp",
  "rule",
  "agent",
  "manager",
  "decoder",
  "location",
  "input",
  "data",
  "syscheck",
  "sca",
  "predecoder",
  "id",
  "cluster",
]);

function redactString(value: string): string {
  let text = value;
  text = text.replace(
    /(authorization)\s*[:=]\s*bearer\s+[^\s,;]+/gi,
    "$1: [REDACTED]"
  );
  text = text.replace(
    /(authorization|cookie|set-cookie|password|passwd|token|api[_-]?key|secret)\s*[:=]\s*[^\s,;]+/gi,
    "$1: [REDACTED]"
  );
  if (text.length > 2000) text = `${text.slice(0, 2000)}…`;
  return text;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => sanitizeValue(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY_PATTERN.test(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = sanitizeValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/**
 * Produce a sanitized subset of a Wazuh `_source` document for storage.
 */
export function sanitizeWazuhAlertSource(
  source: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!source) return null;
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_TOP_LEVEL) {
    if (key in source) {
      out[key] = sanitizeValue(source[key]);
    }
  }
  // Never store full_log unless short and already redacted
  if (typeof source.full_log === "string") {
    const redacted = redactString(source.full_log);
    if (redacted.length <= 500) out.full_log = redacted;
    else out.full_log = `${redacted.slice(0, 500)}…`;
  }
  return out;
}

export function sanitizeFreeText(
  value: string | null | undefined,
  max = 2000
): string | null {
  if (value == null) return null;
  let text = value.trim().replace(/<[^>]*>/g, "");
  if (!text) return null;
  text = redactString(text);
  if (text.length > max) text = `${text.slice(0, max)}…`;
  return text;
}
