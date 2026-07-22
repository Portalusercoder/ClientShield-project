/**
 * Sanitize free-text incident fields (notes, response summaries, impacts).
 * Strips HTML-ish tags and redacts common secret patterns.
 */
export function sanitizeIncidentText(
  value: string | null | undefined,
  max = 5000
): string | null {
  if (value == null) return null;
  let text = value.trim();
  if (!text) return null;

  // Neutralize HTML / script injection vectors (store plain text only)
  text = text.replace(/<[^>]*>/g, "");
  text = text.replace(/[<>]/g, "");

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
