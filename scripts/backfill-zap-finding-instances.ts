/**
 * Backfill: consolidate granular OWASP_ZAP findings into Finding + FindingInstance.
 *
 * Dry-run by default (no DB writes).
 *
 *   npx tsx scripts/backfill-zap-finding-instances.ts
 *   npx tsx scripts/backfill-zap-finding-instances.ts --apply
 *
 * Grouping strategy:
 *   Finding.code = ZAP:{pluginId}
 *   Scoped by (organizationId, assetId, source=OWASP_ZAP)
 *   Instance key = hash(normalizedPath|method|param)
 *
 * Status conflict rule (conservative):
 *   1. If any ACCEPTED_RISK → keep ACCEPTED_RISK (prefer earliest approval metadata)
 *   2. Else if any FALSE_POSITIVE → keep FALSE_POSITIVE
 *   3. Else if ALL RESOLVED → RESOLVED (latest resolvedAt)
 *   4. Else if mix RESOLVED + open → OPEN, flag conflict
 *   5. Else prefer IN_PROGRESS > VALIDATED > OPEN
 *
 * NEVER silently merges ACCEPTED_RISK / FALSE_POSITIVE into OPEN.
 */
import { PrismaClient, Prisma, type FindingStatus } from "@prisma/client";
import {
  buildZapFindingCode,
  buildZapInstanceKey,
  normalizeZapMethod,
  normalizeZapParam,
  normalizeZapPath,
} from "../services/zap/zap-alert-normalizer.service";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

type GroupRow = {
  organizationId: string;
  assetId: string;
  pluginId: string;
  title: string;
  severity: string;
  count: number;
  statuses: string[];
};

function extractPluginId(code: string | null): string | null {
  if (!code) return null;
  // New form: ZAP:{pluginId}
  // Legacy form: ZAP:{pluginId}:{pathHash}:{param}
  const parts = code.split(":");
  if (parts[0] !== "ZAP" || !parts[1]) return null;
  return parts[1];
}

function resolveGroupStatus(
  statuses: FindingStatus[]
): { status: FindingStatus; conflict: boolean; note: string } {
  const set = new Set(statuses);
  if (set.has("ACCEPTED_RISK")) {
    return {
      status: "ACCEPTED_RISK",
      conflict: set.size > 1,
      note: set.size > 1
        ? "Group contains ACCEPTED_RISK plus other statuses — preserving ACCEPTED_RISK"
        : "ACCEPTED_RISK",
    };
  }
  if (set.has("FALSE_POSITIVE")) {
    return {
      status: "FALSE_POSITIVE",
      conflict: set.size > 1,
      note: set.size > 1
        ? "Group contains FALSE_POSITIVE plus other statuses — preserving FALSE_POSITIVE"
        : "FALSE_POSITIVE",
    };
  }
  if (set.size === 1 && set.has("RESOLVED")) {
    return { status: "RESOLVED", conflict: false, note: "All RESOLVED" };
  }
  if (set.has("RESOLVED") && (set.has("OPEN") || set.has("VALIDATED") || set.has("IN_PROGRESS"))) {
    return {
      status: "OPEN",
      conflict: true,
      note: "Mixed RESOLVED + unresolved — keeping OPEN for analyst review",
    };
  }
  if (set.has("IN_PROGRESS")) {
    return { status: "IN_PROGRESS", conflict: set.size > 1, note: "Prefer IN_PROGRESS" };
  }
  if (set.has("VALIDATED")) {
    return { status: "VALIDATED", conflict: set.size > 1, note: "Prefer VALIDATED" };
  }
  return { status: "OPEN", conflict: false, note: "OPEN" };
}

function instanceFromLegacyEvidence(finding: {
  id: string;
  evidence: unknown;
  code: string | null;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  scanId: string | null;
}): {
  instanceKey: string;
  url: string | null;
  normalizedPath: string;
  httpMethod: string;
  parameter: string | null;
  evidence: Record<string, unknown>;
} {
  const ev =
    finding.evidence && typeof finding.evidence === "object"
      ? (finding.evidence as Record<string, unknown>)
      : {};

  const path =
    typeof ev.path === "string"
      ? normalizeZapPath(ev.path)
      : (() => {
          // Legacy code: ZAP:plugin:pathHash:param — path not recoverable; use hash placeholder
          const parts = finding.code?.split(":") ?? [];
          return parts.length >= 3 ? `/legacy/${parts[2]}` : "/";
        })();

  const method = normalizeZapMethod(
    typeof ev.method === "string" ? ev.method : "GET"
  );
  const param =
    typeof ev.param === "string" ? normalizeZapParam(ev.param) || null : null;

  const host = typeof ev.host === "string" ? ev.host : null;
  const url = host ? `https://${host}${path}` : path;

  return {
    instanceKey: buildZapInstanceKey({
      url: path,
      method,
      param: param ?? undefined,
    }),
    url,
    normalizedPath: path,
    httpMethod: method,
    parameter: param,
    evidence: {
      path,
      method,
      param,
      evidenceSnippet: ev.evidenceSnippet ?? null,
      otherInfoSnippet: ev.otherInfoSnippet ?? null,
      migratedFromFindingId: finding.id,
    },
  };
}

async function main() {
  console.log(
    APPLY
      ? "MODE: APPLY — will consolidate OWASP_ZAP findings\n"
      : "MODE: DRY-RUN — no database changes\n"
  );

  const zapFindings = await prisma.finding.findMany({
    where: { source: "OWASP_ZAP" },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<
    string,
    {
      organizationId: string;
      assetId: string;
      pluginId: string;
      findings: typeof zapFindings;
    }
  >();

  let unparseable = 0;
  for (const f of zapFindings) {
    const pluginId = extractPluginId(f.code);
    if (!pluginId) {
      unparseable += 1;
      continue;
    }
    const key = `${f.organizationId}|${f.assetId}|${pluginId}`;
    const g = groups.get(key) ?? {
      organizationId: f.organizationId,
      assetId: f.assetId,
      pluginId,
      findings: [],
    };
    g.findings.push(f);
    groups.set(key, g);
  }

  const summaryRows: GroupRow[] = [];
  let conflictGroups = 0;
  let totalInstances = 0;

  for (const g of groups.values()) {
    const statuses = g.findings.map((f) => f.status);
    const resolved = resolveGroupStatus(statuses);
    if (resolved.conflict) conflictGroups += 1;

    // Estimate unique instances
    const keys = new Set<string>();
    for (const f of g.findings) {
      keys.add(instanceFromLegacyEvidence(f).instanceKey);
    }
    totalInstances += keys.size;

    const titleCounts = new Map<string, number>();
    for (const f of g.findings) {
      titleCounts.set(f.title, (titleCounts.get(f.title) ?? 0) + 1);
    }
    const title =
      [...titleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      g.findings[0]!.title;

    summaryRows.push({
      organizationId: g.organizationId,
      assetId: g.assetId,
      pluginId: g.pluginId,
      title,
      severity: g.findings[0]!.severity,
      count: g.findings.length,
      statuses: [...new Set(statuses)],
    });
  }

  summaryRows.sort((a, b) => b.count - a.count);

  console.log("=== DRY-RUN SUMMARY ===");
  console.log(`Current OWASP_ZAP findings: ${zapFindings.length}`);
  console.log(`Unique grouped findings:    ${groups.size}`);
  console.log(`Finding instances (est.):   ${totalInstances}`);
  console.log(`Unparseable codes:          ${unparseable}`);
  console.log(`Status-conflict groups:     ${conflictGroups}`);
  console.log("");
  console.log("Top groups (before → after):");
  for (const row of summaryRows.slice(0, 20)) {
    console.log(
      `  ${row.title} [plugin ${row.pluginId}] ${row.severity}: ${row.count} findings → 1 finding + ~${row.count} instances (statuses: ${row.statuses.join(",")})`
    );
  }

  if (!APPLY) {
    console.log(
      "\nDry-run complete. Re-run with --apply to consolidate (after review)."
    );
    return;
  }

  console.log("\nApplying consolidation…");

  let survivors = 0;
  let deleted = 0;
  let instancesCreated = 0;

  for (const g of groups.values()) {
    const statuses = g.findings.map((f) => f.status);
    const resolved = resolveGroupStatus(statuses);
    const sorted = [...g.findings].sort(
      (a, b) => a.firstDetectedAt.getTime() - b.firstDetectedAt.getTime()
    );
    const survivor = sorted[0]!;
    const others = sorted.slice(1);

    const titleCounts = new Map<string, number>();
    for (const f of g.findings) {
      titleCounts.set(f.title, (titleCounts.get(f.title) ?? 0) + 1);
    }
    const title =
      [...titleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      survivor.title;

    const firstDetectedAt = new Date(
      Math.min(...g.findings.map((f) => f.firstDetectedAt.getTime()))
    );
    const lastDetectedAt = new Date(
      Math.max(...g.findings.map((f) => f.lastDetectedAt.getTime()))
    );

    const accepted = g.findings.find((f) => f.status === "ACCEPTED_RISK");
    const falsePos = g.findings.find((f) => f.status === "FALSE_POSITIVE");
    const primaryMeta = accepted ?? falsePos ?? survivor;

    const findingEvidence = {
      pluginId: g.pluginId,
      risk:
        survivor.evidence &&
        typeof survivor.evidence === "object" &&
        "risk" in (survivor.evidence as object)
          ? (survivor.evidence as { risk?: string }).risk
          : null,
      confidence:
        survivor.evidence &&
        typeof survivor.evidence === "object" &&
        "confidence" in (survivor.evidence as object)
          ? (survivor.evidence as { confidence?: string }).confidence
          : null,
      cweId:
        survivor.evidence &&
        typeof survivor.evidence === "object" &&
        "cweId" in (survivor.evidence as object)
          ? (survivor.evidence as { cweId?: string }).cweId
          : null,
      wascId:
        survivor.evidence &&
        typeof survivor.evidence === "object" &&
        "wascId" in (survivor.evidence as object)
          ? (survivor.evidence as { wascId?: string }).wascId
          : null,
      requiresAnalystValidation: true,
      backfillConflict: resolved.conflict ? resolved.note : undefined,
    };

    await prisma.finding.update({
      where: { id: survivor.id },
      data: {
        code: buildZapFindingCode(g.pluginId),
        title,
        status: resolved.status,
        firstDetectedAt,
        lastDetectedAt,
        resolvedAt:
          resolved.status === "RESOLVED"
            ? survivor.resolvedAt ?? lastDetectedAt
            : resolved.status === "ACCEPTED_RISK" ||
                resolved.status === "FALSE_POSITIVE"
              ? null
              : null,
        statusReason: primaryMeta.statusReason,
        acceptedRiskApprovedByUserId: primaryMeta.acceptedRiskApprovedByUserId,
        acceptedRiskApprovedAt: primaryMeta.acceptedRiskApprovedAt,
        acceptedRiskReviewDate: primaryMeta.acceptedRiskReviewDate,
        evidence: findingEvidence,
        remediationGuidance:
          g.findings.find((f) => f.remediationGuidance)?.remediationGuidance ??
          survivor.remediationGuidance,
      },
    });
    survivors += 1;

    // Create instances from all members
    const seenKeys = new Set<string>();
    for (const f of g.findings) {
      const inst = instanceFromLegacyEvidence(f);
      if (seenKeys.has(inst.instanceKey)) {
        // Update lastDetectedAt if later
        await prisma.findingInstance.updateMany({
          where: {
            findingId: survivor.id,
            instanceKey: inst.instanceKey,
            lastDetectedAt: { lt: f.lastDetectedAt },
          },
          data: {
            lastDetectedAt: f.lastDetectedAt,
            scanId: f.scanId,
          },
        });
        continue;
      }
      seenKeys.add(inst.instanceKey);

      await prisma.findingInstance.upsert({
        where: {
          findingId_instanceKey: {
            findingId: survivor.id,
            instanceKey: inst.instanceKey,
          },
        },
        create: {
          organizationId: g.organizationId,
          findingId: survivor.id,
          scanId: f.scanId,
          instanceKey: inst.instanceKey,
          url: inst.url,
          normalizedPath: inst.normalizedPath,
          httpMethod: inst.httpMethod,
          parameter: inst.parameter,
          evidence: inst.evidence as Prisma.InputJsonValue,
          firstDetectedAt: f.firstDetectedAt,
          lastDetectedAt: f.lastDetectedAt,
        },
        update: {
          lastDetectedAt: f.lastDetectedAt,
          scanId: f.scanId,
        },
      });
      instancesCreated += 1;
    }

    // Re-point remediation tasks from duplicates to survivor
    if (others.length > 0) {
      await prisma.remediationTask.updateMany({
        where: { findingId: { in: others.map((o) => o.id) } },
        data: { findingId: survivor.id },
      });

      await prisma.finding.deleteMany({
        where: { id: { in: others.map((o) => o.id) } },
      });
      deleted += others.length;
    }
  }

  console.log(
    `\nApplied: survivors=${survivors}, deleted_duplicates=${deleted}, instances_upserted=${instancesCreated}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
