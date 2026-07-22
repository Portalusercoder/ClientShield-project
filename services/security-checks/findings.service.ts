import type { FindingSeverity, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sanitizeEvidence } from "@/lib/findings/sanitize-evidence";
import { createAuditLog } from "@/services/audit.service";
import {
  MANUAL_TERMINAL_FINDING_STATUSES,
  PASSIVE_REMEDIATION_GUIDANCE,
  UNRESOLVED_FINDING_STATUSES,
} from "@/types/findings";
import type { SecurityCheckSummary } from "@/types/security-check";

function evidenceJson(
  evidence: Record<string, unknown> | undefined
): Prisma.InputJsonValue | undefined {
  if (!evidence) return undefined;
  return sanitizeEvidence(evidence) as Prisma.InputJsonValue;
}

interface FindingDraft {
  code: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  evidence?: Record<string, unknown>;
}

/**
 * Builds informational findings from passive check results.
 * Does not claim exploitability from missing headers alone.
 */
export function buildPassiveFindings(
  summary: SecurityCheckSummary
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  if (!summary.https.reachable) {
    findings.push({
      code: "HTTPS_UNAVAILABLE",
      title: "HTTPS unavailable",
      description:
        "The asset HTTPS endpoint was not reachable during the passive check.",
      severity: "HIGH",
      evidence: {
        error: summary.https.error,
        reachable: false,
      },
    });
  }

  if (summary.tls.status === "EXPIRED") {
    findings.push({
      code: "TLS_EXPIRED",
      title: "TLS certificate expired",
      description: "The TLS certificate is expired and should be renewed.",
      severity: "CRITICAL",
      evidence: {
        status: summary.tls.status,
        validTo: summary.tls.validTo,
        daysUntilExpiration: summary.tls.daysUntilExpiration,
      },
    });
  } else if (summary.tls.status === "EXPIRING_SOON") {
    findings.push({
      code: "TLS_EXPIRING_SOON",
      title: "TLS certificate expiring soon",
      description: `The TLS certificate expires in ${summary.tls.daysUntilExpiration ?? "unknown"} day(s).`,
      severity: "MEDIUM",
      evidence: {
        status: summary.tls.status,
        validTo: summary.tls.validTo,
        daysUntilExpiration: summary.tls.daysUntilExpiration,
      },
    });
  } else if (summary.tls.status === "INVALID") {
    findings.push({
      code: "TLS_INVALID",
      title: "TLS certificate invalid",
      description:
        summary.tls.error ??
        "The TLS certificate could not be validated for this host.",
      severity: "HIGH",
      evidence: {
        status: summary.tls.status,
        error: summary.tls.error,
      },
    });
  }

  for (const header of summary.headers.items) {
    if (header.status === "MISSING" || header.status === "INVALID") {
      const map: Record<
        string,
        { code: string; title: string; severity: FindingSeverity }
      > = {
        "Strict-Transport-Security": {
          code: "HSTS_MISSING",
          title: "HSTS missing",
          severity: "MEDIUM",
        },
        "Content-Security-Policy": {
          code: "CSP_MISSING",
          title: "Content-Security-Policy missing",
          severity: "MEDIUM",
        },
        "Clickjacking-Protection": {
          code: "CLICKJACKING_PROTECTION_MISSING",
          title: "Clickjacking protection missing",
          severity: "MEDIUM",
        },
        "X-Content-Type-Options": {
          code: "XCTO_MISSING",
          title: "X-Content-Type-Options missing or invalid",
          severity: "LOW",
        },
        "Referrer-Policy": {
          code: "REFERRER_POLICY_MISSING",
          title: "Referrer-Policy missing",
          severity: "LOW",
        },
        "Permissions-Policy": {
          code: "PERMISSIONS_POLICY_MISSING",
          title: "Permissions-Policy missing",
          severity: "INFO",
        },
      };

      const meta = map[header.name];
      if (meta) {
        findings.push({
          code: meta.code,
          title: meta.title,
          description: `${header.explanation} This is a configuration observation, not proof of exploitability.`,
          severity: meta.severity,
          evidence: {
            header: header.name,
            status: header.status,
          },
        });
      }
    }
  }

  if (summary.cookies.cookiesObserved > 0) {
    if (summary.cookies.allSecure === false) {
      findings.push({
        code: "COOKIE_SECURE_MISSING",
        title: "Cookie missing Secure attribute",
        description:
          "One or more cookies were observed without the Secure attribute.",
        severity: "MEDIUM",
        evidence: {
          cookiesObserved: summary.cookies.cookiesObserved,
          allSecure: false,
        },
      });
    }
    if (summary.cookies.allHttpOnly === false) {
      findings.push({
        code: "COOKIE_HTTPONLY_MISSING",
        title: "Cookie missing HttpOnly attribute",
        description:
          "One or more cookies were observed without the HttpOnly attribute.",
        severity: "LOW",
        evidence: {
          cookiesObserved: summary.cookies.cookiesObserved,
          allHttpOnly: false,
        },
      });
    }
  }

  return findings;
}

/**
 * Upserts unresolved findings by code and resolves issues that no longer apply.
 *
 * Recurrence strategy:
 * - If an issue returns after RESOLVED, reopen the same finding (status=OPEN),
 *   clear resolvedAt, and update lastDetectedAt.
 * - ACCEPTED_RISK and FALSE_POSITIVE are never auto-resolved or auto-reopened.
 */
export async function syncPassiveFindings(input: {
  organizationId: string;
  assetId: string;
  scanId: string;
  summary: SecurityCheckSummary;
  actorId?: string;
}): Promise<void> {
  const asset = await prisma.asset.findFirst({
    where: { id: input.assetId, organizationId: input.organizationId },
    select: { id: true, clientId: true },
  });
  if (!asset) return;

  const desired = buildPassiveFindings(input.summary);
  const desiredCodes = new Set(desired.map((f) => f.code));
  const now = new Date();

  const trackedFindings = await prisma.finding.findMany({
    where: {
      organizationId: input.organizationId,
      assetId: input.assetId,
      source: "PASSIVE_CHECK",
      code: { not: null },
    },
  });

  // Auto-resolve only unresolved findings that are no longer present.
  for (const existing of trackedFindings) {
    if (!existing.code) continue;
    if (MANUAL_TERMINAL_FINDING_STATUSES.includes(existing.status)) continue;
    if (!UNRESOLVED_FINDING_STATUSES.includes(existing.status)) continue;
    if (desiredCodes.has(existing.code)) continue;

    await prisma.finding.update({
      where: { id: existing.id },
      data: {
        status: "RESOLVED",
        resolvedAt: now,
        scanId: input.scanId,
        lastDetectedAt: existing.lastDetectedAt,
      },
    });

    if (input.actorId) {
      await createAuditLog({
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: "FINDING_RESOLVED",
        resourceType: "Finding",
        resourceId: existing.id,
        metadata: { reason: "passive_check_cleared", code: existing.code },
      });
    }
  }

  for (const draft of desired) {
    const active = trackedFindings.find(
      (f) =>
        f.code === draft.code &&
        UNRESOLVED_FINDING_STATUSES.includes(f.status)
    );

    if (active) {
      await prisma.finding.update({
        where: { id: active.id },
        data: {
          title: draft.title,
          description: draft.description,
          severity: draft.severity,
          scanId: input.scanId,
          lastDetectedAt: now,
          clientId: asset.clientId,
          evidence: evidenceJson(draft.evidence),
          remediationGuidance:
            PASSIVE_REMEDIATION_GUIDANCE[draft.code] ??
            active.remediationGuidance,
        },
      });
      continue;
    }

    const terminal = trackedFindings.find(
      (f) =>
        f.code === draft.code &&
        MANUAL_TERMINAL_FINDING_STATUSES.includes(f.status)
    );
    // Do not reopen accepted risk / false positive automatically.
    if (terminal) continue;

    const previouslyResolved = trackedFindings.find(
      (f) => f.code === draft.code && f.status === "RESOLVED"
    );

    if (previouslyResolved) {
      await prisma.finding.update({
        where: { id: previouslyResolved.id },
        data: {
          status: "OPEN",
          resolvedAt: null,
          title: draft.title,
          description: draft.description,
          severity: draft.severity,
          scanId: input.scanId,
          lastDetectedAt: now,
          clientId: asset.clientId,
          evidence: evidenceJson(draft.evidence),
          remediationGuidance:
            PASSIVE_REMEDIATION_GUIDANCE[draft.code] ?? null,
        },
      });

      if (input.actorId) {
        await createAuditLog({
          organizationId: input.organizationId,
          actorId: input.actorId,
          action: "FINDING_REOPENED",
          resourceType: "Finding",
          resourceId: previouslyResolved.id,
          metadata: { code: draft.code, reason: "recurrence" },
        });
      }
      continue;
    }

    const created = await prisma.finding.create({
      data: {
        organizationId: input.organizationId,
        clientId: asset.clientId,
        assetId: input.assetId,
        scanId: input.scanId,
        source: "PASSIVE_CHECK",
        code: draft.code,
        title: draft.title,
        description: draft.description,
        severity: draft.severity,
        status: "OPEN",
        evidence: evidenceJson(draft.evidence),
        remediationGuidance: PASSIVE_REMEDIATION_GUIDANCE[draft.code] ?? null,
        firstDetectedAt: now,
        lastDetectedAt: now,
      },
    });

    if (input.actorId) {
      await createAuditLog({
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: "FINDING_CREATED",
        resourceType: "Finding",
        resourceId: created.id,
        metadata: { code: draft.code, source: "PASSIVE_CHECK" },
      });
    }
  }
}

export async function countOpenFindingsBySeverity(
  organizationId: string,
  severity: FindingSeverity
): Promise<number> {
  return prisma.finding.count({
    where: {
      organizationId,
      severity,
      status: { in: UNRESOLVED_FINDING_STATUSES },
    },
  });
}
