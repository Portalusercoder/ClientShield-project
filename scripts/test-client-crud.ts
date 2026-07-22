/**
 * Functional test for Clients CRUD operations.
 * Run with: npx tsx scripts/test-client-crud.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  archiveClient,
  countClients,
  createClient,
  getClientById,
  listClients,
  updateClient,
} from "../services/clients.service";
import { DEV_ORG_ID } from "../lib/dev-constants";

const prisma = new PrismaClient();

async function main() {
  console.log("Testing Clients CRUD...\n");

  const initialCount = await countClients(DEV_ORG_ID);
  console.log(`Initial active client count: ${initialCount}`);

  const created = await createClient(DEV_ORG_ID, {
    name: "Test Automation Corp",
    industry: "Testing",
    primaryContactName: "Test User",
    primaryContactEmail: "test@test-automation.example",
    status: "ONBOARDING",
  });
  console.log(`Create: PASS (id=${created.id})`);

  const fetched = await getClientById(DEV_ORG_ID, created.id);
  console.log(`Read: ${fetched?.name === "Test Automation Corp" ? "PASS" : "FAIL"}`);

  const updated = await updateClient(DEV_ORG_ID, created.id, {
    name: "Test Automation Corp Updated",
    status: "ACTIVE",
  });
  console.log(
    `Update: ${updated?.name === "Test Automation Corp Updated" && updated.status === "ACTIVE" ? "PASS" : "FAIL"}`
  );

  const archived = await archiveClient(DEV_ORG_ID, created.id);
  console.log(
    `Archive: ${archived?.status === "INACTIVE" ? "PASS" : "FAIL"}`
  );

  const list = await listClients(DEV_ORG_ID, { search: "Nextera" });
  console.log(
    `Search: ${list.clients.length >= 1 && list.clients[0].name.includes("Nextera") ? "PASS" : "FAIL"}`
  );

  const afterCount = await countClients(DEV_ORG_ID);
  console.log(`Active count after archive (should exclude test): ${afterCount}`);

  // Cleanup: remove test client
  await prisma.client.delete({ where: { id: created.id } });
  console.log("Cleanup: test client removed");

  console.log("\nCRUD test PASSED");
}

main()
  .catch((e) => {
    console.error("CRUD test FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
