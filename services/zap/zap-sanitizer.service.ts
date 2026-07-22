import { createHash } from "node:crypto";
import type { FindingSeverity } from "@prisma/client";
import { sanitizeEvidence } from "@/lib/findings/sanitize-evidence";
import type { ZapNormalizedFinding, ZapRawAlert } from "@/types/zap";

const SENSITIVE_BODY =
  /(authorization\s*[:=]|cookie\s*[:=]|set-cookie|password|passwd|api[_-]?key|bearer\s+|eyJ[a-zA-Z0-9_-]+\.)/i;

/**
 * Maps ZAP risk codes to ClientShield severities.
 * ZAP High → HIGH (never CRITICAL — Critical requires a separate policy later).
 */
export function mapZapRiskToSeverity(
  riskcode: ZapRawAlert["riskcode"],
  risk?: string
): FindingSeverity {
  const code = String(riskcode ?? "").trim();
  if (code === "3") return "HIGH";
  if (code === "2") return "MEDIUM";
  if (code === "1") return "LOW";
  if (code === "0") return "INFO";

  const label = (risk ?? "").toLowerCase();
  if (label.includes("high")) return "HIGH";
  if (label.includes("medium")) return "MEDIUM";
  if (label.includes("low")) return "LOW";
  return "INFO";
}

/**
 * Normalize a URL/path for instance deduplication.
 * - strips query string and fragment
 * - collapses duplicate slashes
 * - removes trailing slash (except root)
 */
export function normalizeZapPath(urlRaw: string | undefined): string {
  if (!urlRaw) return "/";
  try {
    const u = new URL(urlRaw);
    const path = u.pathname || "/";
    return path.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  } catch {
    const bare = urlRaw.split("?")[0]?.split("#")[0] || "/";
    return bare.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  }
}

export function normalizeZapParam(param: string | undefined): string {
  return (param ?? "").trim().toLowerCase();
}

export function normalizeZapMethod(method: string | undefined): string {
  return (method ?? "").trim().toUpperCase() || "GET";
}

/**
 * Finding-level grouping key (primary ZAP dedupe).
 *
 * Strategy:
 *   Finding.code = `ZAP:{pluginId}`
 *   Scoped at persistence by (organizationId, assetId, source=OWASP_ZAP, code)
 *
 * Path/URL is NOT part of the Finding key — those become FindingInstances.
 * Parameter is NOT part of the Finding key by default (stored on instances).
 */
export function buildZapFindingCode(pluginId: string): string {
  return `ZAP:${pluginId.trim()}`;
}

/**
 * Instance-level dedupe key within a Finding:
 *   normalizedPath + httpMethod + parameter
 */
export function buildZapInstanceKey(input: {
  url?: string;
  method?: string;
  param?: string;
}): string {
  const path = normalizeZapPath(input.url);
  const method = normalizeZapMethod(input.method);
  const param = normalizeZapParam(input.param) || "-";
  return createHash("sha256")
    .update(`${path}|${method}|${param}`)
    .digest("hex")
    .slice(0, 24);
}

function truncate(value: string | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (SENSITIVE_BODY.test(trimmed)) return "[REDACTED]";
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function safeUrlWithoutQuery(urlRaw: string | undefined): string | null {
  if (!urlRaw) return null;
  try {
    const u = new URL(urlRaw);
    return `${u.origin}${normalizeZapPath(urlRaw)}`;
  } catch {
    return normalizeZapPath(urlRaw);
  }
}

/** Plugin-level evidence stored on the Finding (not per-URL). */
export function sanitizeZapFindingEvidence(
  alert: ZapRawAlert
): Record<string, unknown> {
  const evidence = {
    pluginId: alert.pluginId ?? null,
    alertRef: alert.alertRef ?? null,
    risk: alert.risk ?? null,
    riskcode: alert.riskcode ?? null,
    confidence: alert.confidence ?? null,
    cweId: alert.cweid != null ? String(alert.cweid) : null,
    wascId: alert.wascid != null ? String(alert.wascid) : null,
    references: truncate(alert.reference, 1000),
    requiresAnalystValidation: true,
  };
  return sanitizeEvidence(evidence) as Record<string, unknown>;
}

/** Location-level evidence stored on FindingInstance. */
export function sanitizeZapInstanceEvidence(
  alert: ZapRawAlert
): Record<string, unknown> {
  const evidence = {
    method: normalizeZapMethod(alert.method),
    param: normalizeZapParam(alert.param) || null,
    path: normalizeZapPath(alert.url),
    evidenceSnippet: truncate(alert.evidence, 200),
    otherInfoSnippet: truncate(alert.otherinfo, 300),
  };
  return sanitizeEvidence(evidence) as Record<string, unknown>;
}

/** @deprecated Use sanitizeZapFindingEvidence / sanitizeZapInstanceEvidence */
export function sanitizeZapAlertEvidence(
  alert: ZapRawAlert
): Record<string, unknown> {
  return {
    ...sanitizeZapFindingEvidence(alert),
    ...sanitizeZapInstanceEvidence(alert),
  };
}

export function normalizeZapAlert(
  alert: ZapRawAlert
): ZapNormalizedFinding | null {
  const pluginId = String(alert.pluginId ?? "").trim();
  if (!pluginId) return null;

  const title = (alert.name ?? `ZAP alert ${pluginId}`).trim();
  const severity = mapZapRiskToSeverity(alert.riskcode, alert.risk);
  const mappedSeverity = severity === "CRITICAL" ? "HIGH" : severity;

  const descriptionParts = [
    alert.description?.trim(),
    alert.cweid != null && String(alert.cweid) !== "0"
      ? `CWE: ${alert.cweid}`
      : null,
    alert.wascid != null && String(alert.wascid) !== "0"
      ? `WASC: ${alert.wascid}`
      : null,
  ].filter(Boolean);

  return {
    code: buildZapFindingCode(pluginId),
    pluginId,
    title: title.slice(0, 200),
    description: descriptionParts.join("\n\n") || null,
    severity: mappedSeverity as ZapNormalizedFinding["severity"],
    remediationGuidance: truncate(alert.solution, 4000),
    cweId:
      alert.cweid != null && String(alert.cweid) !== "0"
        ? `CWE-${alert.cweid}`
        : null,
    confidence: alert.confidence?.trim() || null,
    risk: alert.risk?.trim() || null,
    findingEvidence: sanitizeZapFindingEvidence(alert),
    instance: {
      instanceKey: buildZapInstanceKey({
        url: alert.url,
        method: alert.method,
        param: alert.param,
      }),
      url: safeUrlWithoutQuery(alert.url),
      normalizedPath: normalizeZapPath(alert.url),
      httpMethod: normalizeZapMethod(alert.method),
      parameter: normalizeZapParam(alert.param) || null,
      evidence: sanitizeZapInstanceEvidence(alert),
    },
  };
}

export function countAlertsBySeverity(
  findings: ZapNormalizedFinding[]
): {
  informational: number;
  low: number;
  medium: number;
  high: number;
} {
  // Count unique findings (by code), not instances
  const byCode = new Map<string, ZapNormalizedFinding["severity"]>();
  for (const f of findings) {
    if (!byCode.has(f.code)) byCode.set(f.code, f.severity);
  }
  const counts = { informational: 0, low: 0, medium: 0, high: 0 };
  for (const severity of byCode.values()) {
    if (severity === "HIGH") counts.high += 1;
    else if (severity === "MEDIUM") counts.medium += 1;
    else if (severity === "LOW") counts.low += 1;
    else counts.informational += 1;
  }
  return counts;
}
