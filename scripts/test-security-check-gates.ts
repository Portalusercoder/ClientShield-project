/**
 * Authorization gate tests for passive security checks (DB-backed).
 * Does not perform network requests against third-party sites.
 */
import { PrismaClient } from "@prisma/client";
import { DEV_ORG_ID } from "../lib/dev-constants";
import { getEligibleAssetForCheck } from "../services/security-checks/security-check.service";

const prisma = new PrismaClient();

async function main() {
  console.log("Testing security-check authorization gates...\n");

  const client = await prisma.client.findFirst({
    where: { organizationId: DEV_ORG_ID },
    select: { id: true },
  });
  if (!client) {
    console.error("No seeded clients. Run npm run db:seed first.");
    process.exit(1);
  }

  const unauthorized = await prisma.asset.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: client.id,
      name: "Gate Test Unauthorized",
      type: "WEBSITE",
      url: "https://example.com",
      authorizationStatus: "PENDING",
      monitoringStatus: "ACTIVE",
    },
  });

  const inactive = await prisma.asset.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: client.id,
      name: "Gate Test Inactive",
      type: "WEBSITE",
      url: "https://example.com",
      authorizationStatus: "AUTHORIZED",
      monitoringStatus: "INACTIVE",
    },
  });

  const serverAsset = await prisma.asset.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: client.id,
      name: "Gate Test Server",
      type: "SERVER",
      hostname: "server.example.com",
      authorizationStatus: "AUTHORIZED",
      monitoringStatus: "ACTIVE",
    },
  });

  const workstationAsset = await prisma.asset.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: client.id,
      name: "Gate Test Workstation",
      type: "WORKSTATION",
      hostname: "laptop.example.local",
      authorizationStatus: "AUTHORIZED",
      monitoringStatus: "ACTIVE",
    },
  });

  const cases: Array<{
    name: string;
    assetId: string;
    orgId: string;
    expectError: RegExp;
  }> = [
    {
      name: "Unauthorized asset blocked",
      assetId: unauthorized.id,
      orgId: DEV_ORG_ID,
      expectError: /AUTHORIZED/i,
    },
    {
      name: "Inactive asset blocked",
      assetId: inactive.id,
      orgId: DEV_ORG_ID,
      expectError: /ACTIVE/i,
    },
    {
      name: "Non-WEB asset blocked",
      assetId: serverAsset.id,
      orgId: DEV_ORG_ID,
      expectError: /WEBSITE|WEB_APPLICATION/i,
    },
    {
      name: "WORKSTATION asset blocked from website checks",
      assetId: workstationAsset.id,
      orgId: DEV_ORG_ID,
      expectError: /WEBSITE|WEB_APPLICATION/i,
    },
    {
      name: "Tenant isolation blocked",
      assetId: unauthorized.id,
      orgId: "clyfakeorg00000000000001",
      expectError: /not found/i,
    },
  ];

  let failed = 0;
  for (const testCase of cases) {
    try {
      await getEligibleAssetForCheck(testCase.orgId, testCase.assetId);
      console.log(`FAIL  ${testCase.name} (expected error)`);
      failed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (testCase.expectError.test(message)) {
        console.log(`PASS  ${testCase.name}`);
      } else {
        console.log(`FAIL  ${testCase.name}: ${message}`);
        failed++;
      }
    }
  }

  await prisma.asset.deleteMany({
    where: {
      id: {
        in: [unauthorized.id, inactive.id, serverAsset.id, workstationAsset.id],
      },
    },
  });

  if (failed > 0) {
    console.error(`\n${failed} gate test(s) failed`);
    process.exit(1);
  }

  console.log("\nAuthorization gate tests PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
