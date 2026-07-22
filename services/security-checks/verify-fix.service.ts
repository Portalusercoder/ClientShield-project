import { prisma } from "@/lib/db";
import { createAuditLog } from "@/services/audit.service";
import { getFindingById } from "@/services/findings.service";
import { runPassiveSecurityCheck } from "@/services/security-checks/security-check.service";
import { UNRESOLVED_FINDING_STATUSES } from "@/types/findings";

/**
 * Verify Fix for PASSIVE_CHECK findings.
 * Re-runs the passive security check for the linked asset and relies on
 * syncPassiveFindings to resolve or keep the finding open.
 */
export async function verifyPassiveFindingFix(input: {
  organizationId: string;
  actorId: string;
  findingId: string;
}) {
  const finding = await prisma.finding.findFirst({
    where: { id: input.findingId, organizationId: input.organizationId },
  });

  if (!finding) throw new Error("Finding not found");
  if (finding.source !== "PASSIVE_CHECK") {
    throw new Error("Verify Fix is only available for PASSIVE_CHECK findings");
  }

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "FINDING_VERIFICATION_TRIGGERED",
    resourceType: "Finding",
    resourceId: finding.id,
    metadata: { assetId: finding.assetId },
  });

  const check = await runPassiveSecurityCheck({
    organizationId: input.organizationId,
    userId: input.actorId,
    assetId: finding.assetId,
  });

  const refreshed = await getFindingById(
    input.organizationId,
    finding.id
  );

  return {
    checkId: check.id,
    finding: refreshed,
    resolved:
      refreshed?.status === "RESOLVED" ||
      (refreshed != null &&
        !UNRESOLVED_FINDING_STATUSES.includes(refreshed.status)),
  };
}
