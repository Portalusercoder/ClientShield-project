import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/services/audit.service";
import type { ZapNormalizedFinding } from "@/types/zap";
import { MANUAL_TERMINAL_FINDING_STATUSES } from "@/types/findings";

/**
 * Upserts OWASP_ZAP findings + FindingInstances.
 *
 * Finding grouping: (organizationId, assetId, source=OWASP_ZAP, code=`ZAP:{pluginId}`)
 * Instance grouping: (findingId, instanceKey=hash(path|method|param))
 *
 * Resolution policy:
 * - Do NOT auto-resolve findings when instances are absent from a later scan.
 * - Recurrence: RESOLVED parent reopens to OPEN when any instance is seen again.
 * - ACCEPTED_RISK / FALSE_POSITIVE parents are never auto-reopened.
 * - New instances may still be recorded under terminal findings for audit trail,
 *   but status is left unchanged.
 */
export async function syncZapFindings(input: {
  organizationId: string;
  assetId: string;
  scanId: string;
  findings: ZapNormalizedFinding[];
  actorId?: string;
}): Promise<{
  created: number;
  updated: number;
  reopened: number;
  instancesCreated: number;
  instancesUpdated: number;
}> {
  const asset = await prisma.asset.findFirst({
    where: { id: input.assetId, organizationId: input.organizationId },
    select: { id: true, clientId: true },
  });
  if (!asset) {
    return {
      created: 0,
      updated: 0,
      reopened: 0,
      instancesCreated: 0,
      instancesUpdated: 0,
    };
  }

  const now = new Date();
  let created = 0;
  let updated = 0;
  let reopened = 0;
  let instancesCreated = 0;
  let instancesUpdated = 0;

  // Group alerts by finding code so we upsert each Finding once
  const byFindingCode = new Map<string, ZapNormalizedFinding[]>();
  for (const draft of input.findings) {
    const list = byFindingCode.get(draft.code) ?? [];
    list.push(draft);
    byFindingCode.set(draft.code, list);
  }

  const codes = [...byFindingCode.keys()];
  const existingFindings = await prisma.finding.findMany({
    where: {
      organizationId: input.organizationId,
      assetId: input.assetId,
      source: "OWASP_ZAP",
      code: { in: codes },
    },
  });
  const findingByCode = new Map(existingFindings.map((f) => [f.code!, f]));

  for (const [code, drafts] of byFindingCode) {
    const primary = drafts[0]!;
    let finding = findingByCode.get(code) ?? null;
    let terminal = false;

    if (!finding) {
      finding = await prisma.finding.create({
        data: {
          organizationId: input.organizationId,
          clientId: asset.clientId,
          assetId: input.assetId,
          scanId: input.scanId,
          source: "OWASP_ZAP",
          code,
          title: primary.title,
          description: primary.description,
          severity: primary.severity,
          status: "OPEN",
          cveId: null,
          evidence: primary.findingEvidence as Prisma.InputJsonValue,
          remediationGuidance: primary.remediationGuidance,
          firstDetectedAt: now,
          lastDetectedAt: now,
        },
      });
      findingByCode.set(code, finding);
      created += 1;

      if (input.actorId) {
        await createAuditLog({
          organizationId: input.organizationId,
          actorId: input.actorId,
          action: "FINDING_CREATED",
          resourceType: "Finding",
          resourceId: finding.id,
          metadata: {
            source: "OWASP_ZAP",
            code,
            pluginId: primary.pluginId,
          },
        });
      }
    } else {
      terminal = MANUAL_TERMINAL_FINDING_STATUSES.includes(finding.status);

      if (!terminal && finding.status === "RESOLVED") {
        finding = await prisma.finding.update({
          where: { id: finding.id },
          data: {
            status: "OPEN",
            resolvedAt: null,
            title: primary.title,
            description: primary.description,
            severity: primary.severity,
            scanId: input.scanId,
            lastDetectedAt: now,
            clientId: asset.clientId,
            evidence: primary.findingEvidence as Prisma.InputJsonValue,
            remediationGuidance: primary.remediationGuidance,
          },
        });
        findingByCode.set(code, finding);
        reopened += 1;

        if (input.actorId) {
          await createAuditLog({
            organizationId: input.organizationId,
            actorId: input.actorId,
            action: "FINDING_REOPENED",
            resourceType: "Finding",
            resourceId: finding.id,
            metadata: {
              source: "OWASP_ZAP",
              code,
              reason: "recurrence",
            },
          });
        }
      } else if (!terminal) {
        finding = await prisma.finding.update({
          where: { id: finding.id },
          data: {
            title: primary.title,
            description: primary.description,
            severity: primary.severity,
            scanId: input.scanId,
            lastDetectedAt: now,
            clientId: asset.clientId,
            evidence: primary.findingEvidence as Prisma.InputJsonValue,
            remediationGuidance: primary.remediationGuidance,
          },
        });
        findingByCode.set(code, finding);
        updated += 1;
      } else {
        // Terminal status: still refresh lastDetectedAt for awareness, keep status
        finding = await prisma.finding.update({
          where: { id: finding.id },
          data: { lastDetectedAt: now, scanId: input.scanId },
        });
        findingByCode.set(code, finding);
      }
    }

    // Upsert instances (even under terminal findings — locations remain tracked)
    const instanceKeys = drafts.map((d) => d.instance.instanceKey);
    const existingInstances = await prisma.findingInstance.findMany({
      where: {
        organizationId: input.organizationId,
        findingId: finding.id,
        instanceKey: { in: instanceKeys },
      },
    });
    const instanceByKey = new Map(
      existingInstances.map((i) => [i.instanceKey, i])
    );

    for (const draft of drafts) {
      const inst = draft.instance;
      const current = instanceByKey.get(inst.instanceKey);

      if (!current) {
        const createdInst = await prisma.findingInstance.create({
          data: {
            organizationId: input.organizationId,
            findingId: finding.id,
            scanId: input.scanId,
            instanceKey: inst.instanceKey,
            url: inst.url,
            normalizedPath: inst.normalizedPath,
            httpMethod: inst.httpMethod,
            parameter: inst.parameter,
            evidence: inst.evidence as Prisma.InputJsonValue,
            firstDetectedAt: now,
            lastDetectedAt: now,
          },
        });
        instanceByKey.set(inst.instanceKey, createdInst);
        instancesCreated += 1;
      } else {
        await prisma.findingInstance.update({
          where: { id: current.id },
          data: {
            scanId: input.scanId,
            url: inst.url ?? current.url,
            lastDetectedAt: now,
            evidence: inst.evidence as Prisma.InputJsonValue,
          },
        });
        instancesUpdated += 1;
      }
    }
  }

  return {
    created,
    updated,
    reopened,
    instancesCreated,
    instancesUpdated,
  };
}
