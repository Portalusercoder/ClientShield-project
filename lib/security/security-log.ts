/**
 * Security-oriented structured logging (Phase 6P3).
 * Edge-safe JSON lines — compatible with observability log shape.
 * Never log secrets.
 */
export type SecurityEventType =
  | "authz_failed"
  | "authn_failed"
  | "rate_limit_exceeded"
  | "suspicious_request"
  | "destructive_blocked"
  | "validation_rejected"
  | "repeated_failure";

export function logSecurityEvent(input: {
  type: SecurityEventType;
  severity?: "info" | "warn" | "error";
  message: string;
  meta?: Record<string, unknown>;
}): void {
  const severity = input.severity ?? "warn";
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level: severity.toUpperCase(),
    service: "security",
    ...(input.meta ?? {}),
    action: input.type,
    message: input.message,
  });
  if (severity === "error") console.error(line);
  else if (severity === "info") console.log(line);
  else console.warn(line);
}

export const logSecurityEventEdge = logSecurityEvent;
