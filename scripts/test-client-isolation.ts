/**
 * Verifies multi-tenant organization isolation for the Clients service.
 * Run with: npx tsx scripts/test-client-isolation.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  getClientById,
  verifyClientOrganizationAccess,
} from "../services/clients.service";
import { DEV_ORG_ID } from "../lib/dev-constants";

const prisma = new PrismaClient();
const FAKE_ORG_ID = "clyfakeorg00000000000001";

async function main() {
  const client = await prisma.client.findFirst({
    where: { organizationId: DEV_ORG_ID },
    select: { id: true, name: true },
  });

  if (!client) {
    console.error("No seeded clients found. Run npm run db:seed first.");
    process.exit(1);
  }

  const ownAccess = await verifyClientOrganizationAccess(
    DEV_ORG_ID,
    client.id
  );
  const crossAccess = await verifyClientOrganizationAccess(
    FAKE_ORG_ID,
    client.id
  );
  const ownClient = await getClientById(DEV_ORG_ID, client.id);
  const crossClient = await getClientById(FAKE_ORG_ID, client.id);

  console.log(`Testing client: ${client.name} (${client.id})`);
  console.log(`  Own org access: ${ownAccess ? "PASS" : "FAIL"}`);
  console.log(`  Cross org access blocked: ${!crossAccess ? "PASS" : "FAIL"}`);
  console.log(`  Own org retrieval: ${ownClient ? "PASS" : "FAIL"}`);
  console.log(`  Cross org retrieval blocked: ${crossClient === null ? "PASS" : "FAIL"}`);

  const allPass =
    ownAccess && !crossAccess && ownClient !== null && crossClient === null;

  if (!allPass) {
    console.error("\nIsolation test FAILED");
    process.exit(1);
  }

  console.log("\nIsolation test PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
