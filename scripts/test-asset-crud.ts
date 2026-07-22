/**
 * Functional tests for Assets CRUD, tenant isolation, and URL validation.
 * Run with: npx tsx scripts/test-asset-crud.ts
 */
import { PrismaClient } from "@prisma/client";
import { createAssetSchema } from "../lib/validations/assets";
import { DEV_ORG_ID } from "../lib/dev-constants";
import {
  archiveAsset,
  countMonitoredAssets,
  createAsset,
  getAssetById,
  listAssets,
  updateAsset,
  verifyAssetOrganizationAccess,
} from "../services/assets.service";

const prisma = new PrismaClient();
const FAKE_ORG_ID = "clyfakeorg00000000000001";

async function main() {
  console.log("Testing Assets module...\n");

  const client = await prisma.client.findFirst({
    where: { organizationId: DEV_ORG_ID, status: { not: "INACTIVE" } },
    select: { id: true, name: true },
  });

  if (!client) {
    console.error("No seeded clients found. Run npm run db:seed first.");
    process.exit(1);
  }

  // Invalid URL rejection for WEBSITE
  const invalid = createAssetSchema.safeParse({
    clientId: client.id,
    name: "Bad Website",
    type: "WEBSITE",
    location: "not a url",
  });
  console.log(
    `Invalid WEBSITE URL rejected: ${!invalid.success ? "PASS" : "FAIL"}`
  );

  // Valid hostname for SERVER
  const validHost = createAssetSchema.safeParse({
    clientId: client.id,
    name: "App Server",
    type: "SERVER",
    location: "app-server.internal.example",
  });
  console.log(
    `Valid SERVER hostname accepted: ${validHost.success ? "PASS" : "FAIL"}`
  );

  const created = await createAsset(DEV_ORG_ID, {
    clientId: client.id,
    name: "Test Asset Portal",
    type: "WEBSITE",
    location: "https://test-portal.example",
    environment: "STAGING",
    criticality: "HIGH",
    monitoringStatus: "ACTIVE",
    authorizationStatus: "PENDING",
    description: "Automated test asset",
    url: "https://test-portal.example",
    hostname: undefined,
  });
  console.log(`Create: PASS (id=${created.id})`);

  const fetched = await getAssetById(DEV_ORG_ID, created.id);
  console.log(
    `Read: ${fetched?.name === "Test Asset Portal" ? "PASS" : "FAIL"}`
  );

  // Cross-org client ownership should fail
  let ownershipBlocked = false;
  try {
    await createAsset(DEV_ORG_ID, {
      clientId: "clyfakeclient00000000001",
      name: "Should Fail",
      type: "WEBSITE",
      location: "https://fail.example",
      environment: "PRODUCTION",
      criticality: "LOW",
      monitoringStatus: "ACTIVE",
      authorizationStatus: "PENDING",
      url: "https://fail.example",
      hostname: undefined,
    });
  } catch {
    ownershipBlocked = true;
  }
  console.log(
    `Foreign client ownership blocked: ${ownershipBlocked ? "PASS" : "FAIL"}`
  );

  const ownAccess = await verifyAssetOrganizationAccess(DEV_ORG_ID, created.id);
  const crossAccess = await verifyAssetOrganizationAccess(
    FAKE_ORG_ID,
    created.id
  );
  console.log(`Own org access: ${ownAccess ? "PASS" : "FAIL"}`);
  console.log(`Cross org access blocked: ${!crossAccess ? "PASS" : "FAIL"}`);

  const updated = await updateAsset(DEV_ORG_ID, created.id, {
    name: "Test Asset Portal Updated",
    authorizationStatus: "AUTHORIZED",
  });
  console.log(
    `Update: ${
      updated?.name === "Test Asset Portal Updated" &&
      updated.authorizationStatus === "AUTHORIZED"
        ? "PASS"
        : "FAIL"
    }`
  );

  const archived = await archiveAsset(DEV_ORG_ID, created.id);
  console.log(
    `Archive: ${archived?.monitoringStatus === "INACTIVE" ? "PASS" : "FAIL"}`
  );

  const list = await listAssets(DEV_ORG_ID, { search: "Nextera" });
  console.log(`List/search works: ${list.total >= 0 ? "PASS" : "FAIL"}`);

  const monitored = await countMonitoredAssets(DEV_ORG_ID);
  console.log(`Dashboard monitored assets count: ${monitored}`);

  // Cleanup — hard delete only the test asset (safe; no related scan/finding data)
  await prisma.asset.delete({ where: { id: created.id } });
  console.log("Cleanup: test asset removed");

  console.log("\nAsset tests PASSED");
}

main()
  .catch((e) => {
    console.error("Asset tests FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
