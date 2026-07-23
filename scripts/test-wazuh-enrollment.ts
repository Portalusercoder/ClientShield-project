/**
 * Remote Wazuh enrollment application-layer tests.
 * Does not enroll real remote devices or change Docker networking.
 * Run: npm run test:wazuh-enrollment
 */
import { PrismaClient } from "@prisma/client";
import { DEV_ORG_ID } from "../lib/dev-constants";
import { mapEnrollmentAgentSchema } from "../lib/validations/wazuh-enrollment";
import {
  getEnrollmentById,
  prepareWazuhEnrollment,
  revokeWazuhEnrollment,
} from "../services/wazuh/wazuh-enrollment.service";
import { calculateWazuhReadiness } from "../services/clients/client-readiness.service";
import { buildEnrollmentInstructions } from "../lib/wazuh/enrollment-instructions";

const prisma = new PrismaClient();
const OTHER_ORG = "cly_enrollment_isolation_org";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`PASS: ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("=== Wazuh Remote Enrollment Tests ===\n");

  const map001 = await prisma.wazuhAgentMapping.findFirst({
    where: { organizationId: DEV_ORG_ID, wazuhAgentId: "001", status: "ACTIVE" },
  });
  const map000 = await prisma.wazuhAgentMapping.findFirst({
    where: { organizationId: DEV_ORG_ID, wazuhAgentId: "000" },
  });
  const checkpointBefore = await prisma.wazuhIngestionState.findFirst({
    where: { organizationId: DEV_ORG_ID },
    select: { lastTimestamp: true, lastDocumentId: true },
  });
  const seBefore = await prisma.securityEvent.count({
    where: { organizationId: DEV_ORG_ID },
  });
  const findingBefore = await prisma.finding.count({
    where: { organizationId: DEV_ORG_ID },
  });
  const incident = await prisma.incident.findFirst({
    where: { organizationId: DEV_ORG_ID, caseNumber: "INC-2026-000001" },
  });

  check("Agent 001 ACTIVE mapping preserved", !!map001?.assetId);
  check("Agent 000 unmapped", !map000);
  check("INC-2026-000001 preserved", !!incident);

  const client = await prisma.client.create({
    data: {
      organizationId: DEV_ORG_ID,
      name: `Enrollment Test ${Date.now()}`,
      slug: `enrollment-test-${Date.now()}`,
      status: "ONBOARDING",
    },
  });

  await prisma.clientService.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: client.id,
      serviceType: "WAZUH_ENDPOINT_MONITORING",
      status: "ACTIVE",
      enabledAt: new Date(),
    },
  });

  const unauthorized = await prisma.asset.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: client.id,
      name: "Unauthorized WS",
      type: "WORKSTATION",
      hostname: "unauth-ws.local",
      authorizationStatus: "PENDING",
    },
  });

  let blockedUnauth = false;
  try {
    await prepareWazuhEnrollment({
      organizationId: DEV_ORG_ID,
      actorId: "cly00000000000000000000002",
      data: {
        assetId: unauthorized.id,
        agentName: "unauth-ws",
        expectedHostname: "unauth-ws.local",
        platform: "MACOS",
        architecture: "ARM64",
      },
    });
  } catch {
    blockedUnauth = true;
  }
  check("Unauthorized asset cannot prepare enrollment", blockedUnauth);

  const asset = await prisma.asset.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: client.id,
      name: "Enrollment WS",
      type: "WORKSTATION",
      hostname: "enroll-ws.local",
      authorizationStatus: "AUTHORIZED",
    },
  });

  const prepared = await prepareWazuhEnrollment({
    organizationId: DEV_ORG_ID,
    actorId: "cly00000000000000000000002",
    data: {
      assetId: asset.id,
      agentName: "enroll-ws",
      expectedHostname: "enroll-ws.local",
      platform: "MACOS",
      architecture: "ARM64",
      connectionHint: "Tailscale overlay — do not use public IP",
    },
  });
  check("Prepare enrollment → READY", prepared.enrollment.status === "READY");
  check(
    "Instructions contain secret placeholder",
    prepared.instructions.commands.some((c) =>
      c.includes("<ENROLLMENT_SECRET>")
    )
  );
  check(
    "Instructions contain warning",
    prepared.instructions.warning.includes("authorized to monitor")
  );

  let dupBlocked = false;
  try {
    await prepareWazuhEnrollment({
      organizationId: DEV_ORG_ID,
      actorId: "cly00000000000000000000002",
      data: {
        assetId: asset.id,
        agentName: "enroll-ws-2",
        expectedHostname: "enroll-ws.local",
        platform: "LINUX",
        architecture: "X64",
      },
    });
  } catch {
    dupBlocked = true;
  }
  check("Duplicate open enrollment blocked", dupBlocked);

  const agent000Rejected = !mapEnrollmentAgentSchema.safeParse({
    enrollmentId: prepared.enrollment.id,
    wazuhAgentId: "000",
  }).success;
  check("Schema rejects agent 000", agent000Rejected);

  // Force expire
  await prisma.wazuhAgentEnrollment.update({
    where: { id: prepared.enrollment.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const expired = await getEnrollmentById(
    DEV_ORG_ID,
    prepared.enrollment.id
  );
  check("Expired enrollment auto-marked", expired?.status === "EXPIRED");

  // New enrollment for revoke path
  const prepared2 = await prepareWazuhEnrollment({
    organizationId: DEV_ORG_ID,
    actorId: "cly00000000000000000000002",
    data: {
      assetId: asset.id,
      agentName: "enroll-ws-b",
      expectedHostname: "enroll-ws.local",
      platform: "WINDOWS",
      architecture: "X64",
    },
  });
  await revokeWazuhEnrollment({
    organizationId: DEV_ORG_ID,
    actorId: "cly00000000000000000000002",
    enrollmentId: prepared2.enrollment.id,
    deactivateMapping: true,
  });
  const revoked = await getEnrollmentById(DEV_ORG_ID, prepared2.enrollment.id);
  check("Revoke enrollment", revoked?.status === "REVOKED");

  await prisma.organization.upsert({
    where: { id: OTHER_ORG },
    create: { id: OTHER_ORG, name: "Enrollment Isolation", slug: "enroll-iso" },
    update: {},
  });
  const cross = await getEnrollmentById(OTHER_ORG, prepared2.enrollment.id);
  check("Cross-org enrollment read blocked", cross === null);

  const readiness = await calculateWazuhReadiness(DEV_ORG_ID, client.id);
  check(
    "Readiness not CONNECTED without mapping",
    readiness?.status !== "CONNECTED"
  );

  const harborline = await prisma.client.findFirst({
    where: { organizationId: DEV_ORG_ID, name: "Harborline Retail Group" },
  });
  if (harborline) {
    const h = await calculateWazuhReadiness(DEV_ORG_ID, harborline.id);
    check(
      "Harborline Wazuh CONNECTED with mapped agent",
      h?.status === "CONNECTED",
      h?.status
    );
  }

  // Platform instruction coverage
  for (const platform of ["MACOS", "WINDOWS", "LINUX"] as const) {
    const instr = buildEnrollmentInstructions({
      platform,
      architecture: platform === "MACOS" ? "ARM64" : "X64",
      agentName: "demo-agent",
      expectedHostname: "demo-host",
    });
    check(
      `${platform} instructions use placeholders`,
      instr.commands.join("\n").includes("<MANAGER_ADDRESS>") &&
        !instr.commands.join("\n").includes("password=")
    );
  }

  const seAfter = await prisma.securityEvent.count({
    where: { organizationId: DEV_ORG_ID },
  });
  const findingAfter = await prisma.finding.count({
    where: { organizationId: DEV_ORG_ID },
  });
  const checkpointAfter = await prisma.wazuhIngestionState.findFirst({
    where: { organizationId: DEV_ORG_ID },
    select: { lastTimestamp: true, lastDocumentId: true },
  });
  const map001After = await prisma.wazuhAgentMapping.findFirst({
    where: { organizationId: DEV_ORG_ID, wazuhAgentId: "001", status: "ACTIVE" },
  });

  check("SecurityEvents preserved", seBefore === seAfter);
  check("Findings preserved", findingBefore === findingAfter);
  check(
    "Checkpoint unchanged by enrollment tests",
    checkpointBefore?.lastDocumentId === checkpointAfter?.lastDocumentId
  );
  check("Agent 001 still mapped", !!map001After);

  // Cleanup temp assets/client (soft: delete test assets/enrollments/client)
  await prisma.wazuhAgentEnrollment.deleteMany({ where: { clientId: client.id } });
  await prisma.clientService.deleteMany({ where: { clientId: client.id } });
  await prisma.asset.deleteMany({ where: { clientId: client.id } });
  await prisma.client.delete({ where: { id: client.id } });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
