import { PrismaClient } from "@prisma/client";
import { DEV_ORG_ID, DEV_USER_ID } from "../lib/dev-constants";

const prisma = new PrismaClient();

/**
 * Development seed script — creates a dev organization, user, and sample clients.
 * Do not run in production. Uses fictional company names only.
 */
async function main() {
  console.log("Seeding development data...");

  const organization = await prisma.organization.upsert({
    where: { id: DEV_ORG_ID },
    update: { name: "ClientShield Dev Org", slug: "clientshield-dev" },
    create: {
      id: DEV_ORG_ID,
      name: "ClientShield Dev Org",
      slug: "clientshield-dev",
    },
  });

  const user = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: DEV_ORG_ID,
        email: "analyst@clientshield.local",
      },
    },
    update: {
      name: "Security Analyst",
      role: "ANALYST",
    },
    create: {
      id: DEV_USER_ID,
      organizationId: DEV_ORG_ID,
      email: "analyst@clientshield.local",
      name: "Security Analyst",
      role: "ANALYST",
    },
  });

  const clients = [
    {
      name: "Nextera Digital Systems",
      slug: "nextera-digital-systems",
      industry: "Technology",
      primaryContactName: "Alex Rivera",
      primaryContactEmail: "alex.rivera@nextera-dev.example",
      phone: "+1-555-0101",
      website: "https://nextera-dev.example",
      status: "ACTIVE" as const,
      securityScore: 82,
    },
    {
      name: "Harborline Retail Group",
      slug: "harborline-retail-group",
      industry: "Retail",
      primaryContactName: "Jordan Blake",
      primaryContactEmail: "jordan.blake@harborline-dev.example",
      phone: "+1-555-0102",
      website: "https://harborline-dev.example",
      status: "ONBOARDING" as const,
      securityScore: 64,
    },
    {
      name: "Summit IoT Solutions",
      slug: "summit-iot-solutions",
      industry: "IoT & Manufacturing",
      primaryContactName: "Casey Morgan",
      primaryContactEmail: "casey.morgan@summit-iot-dev.example",
      phone: "+1-555-0103",
      website: "https://summit-iot-dev.example",
      status: "ACTIVE" as const,
      securityScore: 71,
    },
  ];

  for (const client of clients) {
    await prisma.client.upsert({
      where: {
        organizationId_slug: {
          organizationId: organization.id,
          slug: client.slug,
        },
      },
      update: client,
      create: {
        ...client,
        organizationId: organization.id,
      },
    });
  }

  console.log(`Seeded organization: ${organization.name} (${organization.id})`);
  console.log(`Seeded user: ${user.email} (${user.id})`);
  console.log(`Seeded ${clients.length} clients`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
