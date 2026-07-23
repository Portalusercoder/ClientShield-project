/**
 * Client onboarding + multi-tenancy UX tests.
 * Run: npx tsx scripts/test-client-onboarding.ts
 *
 * Does not delete existing production/dev security data.
 * Temporary clients created here are offboarded (not hard-deleted).
 */
import { PrismaClient } from "@prisma/client";
import { DEV_ORG_ID } from "../lib/dev-constants";
import {
  archiveClient,
  createClient,
  getClientById,
  updateClient,
  verifyClientOrganizationAccess,
} from "../services/clients.service";
import {
  assertClientLifecycleTransition,
  transitionClientStatus,
} from "../services/clients/client-lifecycle.service";
import {
  createClientContact,
  listClientContacts,
  updateClientContact,
} from "../services/clients/client-contacts.service";
import {
  enableClientService,
  listClientServices,
  pauseClientService,
  disableClientService,
} from "../services/clients/client-services.service";
import {
  calculateClientReadiness,
  calculateWazuhReadiness,
} from "../services/clients/client-readiness.service";
import {
  completeClientOnboarding,
  getOrCreateClientOnboarding,
  updateClientOnboardingStep,
} from "../services/clients/client-onboarding.service";

const prisma = new PrismaClient();
const OTHER_ORG = "cly_onboarding_test_org_isolation";

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
  console.log("=== Client Onboarding + Multi-tenancy Tests ===\n");

  // Preserve existing Harborline / mappings
  const harborline = await prisma.client.findFirst({
    where: { organizationId: DEV_ORG_ID, name: "Harborline Retail Group" },
  });
  const mapping001 = await prisma.wazuhAgentMapping.findFirst({
    where: { organizationId: DEV_ORG_ID, wazuhAgentId: "001" },
  });
  const mapping000 = await prisma.wazuhAgentMapping.findFirst({
    where: { organizationId: DEV_ORG_ID, wazuhAgentId: "000" },
  });
  check("Harborline preserved", !!harborline);
  check("Agent 001 mapped", !!mapping001?.assetId);
  check("Agent 000 unmapped", !mapping000);

  // Lifecycle transition matrix
  try {
    assertClientLifecycleTransition("PROSPECT", "ONBOARDING");
    check("PROSPECT→ONBOARDING allowed", true);
  } catch {
    check("PROSPECT→ONBOARDING allowed", false);
  }
  try {
    assertClientLifecycleTransition("ACTIVE", "ONBOARDING");
    check("ACTIVE→ONBOARDING blocked", false);
  } catch {
    check("ACTIVE→ONBOARDING blocked", true);
  }

  const client = await createClient(DEV_ORG_ID, {
    name: `Onboarding Test ${Date.now()}`,
    industry: "Technology",
    country: "US",
  });
  check("Create client → ONBOARDING", client.status === "ONBOARDING");
  const onboarding = await getOrCreateClientOnboarding(DEV_ORG_ID, client.id);
  check(
    "Onboarding row created",
    onboarding?.status === "IN_PROGRESS" ||
      onboarding?.status === "NOT_STARTED" ||
      onboarding?.status === "READY" ||
      onboarding?.status === "BLOCKED"
  );

  // Contacts
  const contact = await createClientContact(DEV_ORG_ID, client.id, {
    name: "Primary Contact",
    email: "primary@example.test",
    contactType: "PRIMARY",
    isPrimary: true,
  });
  check("Create primary contact", !!contact?.id && contact.isPrimary);

  await createClientContact(DEV_ORG_ID, client.id, {
    name: "Tech Contact",
    email: "tech@example.test",
    contactType: "TECHNICAL",
    isPrimary: true,
  });
  const contacts = await listClientContacts(DEV_ORG_ID, client.id);
  const primaries = contacts.filter((c) => c.isPrimary);
  check("At most one primary contact", primaries.length === 1);

  // Services
  await enableClientService(DEV_ORG_ID, client.id, {
    serviceType: "WAZUH_ENDPOINT_MONITORING",
  });
  await enableClientService(DEV_ORG_ID, client.id, {
    serviceType: "REPORTING",
  });
  const services = await listClientServices(DEV_ORG_ID, client.id);
  check(
    "Services enabled",
    services.some((s) => s.serviceType === "WAZUH_ENDPOINT_MONITORING")
  );
  await pauseClientService(DEV_ORG_ID, client.id, "REPORTING");
  await disableClientService(DEV_ORG_ID, client.id, "REPORTING");

  // Readiness without assets
  let readiness = await calculateClientReadiness(DEV_ORG_ID, client.id);
  check(
    "Not ready without assets",
    readiness?.overall === "NOT_READY" || readiness?.overall === "BLOCKED"
  );
  check(
    "Wazuh blocker when no endpoints",
    !!readiness?.blockers.some((b) => /workstation|server|endpoint/i.test(b))
  );

  // Add endpoint asset
  const asset = await prisma.asset.create({
    data: {
      organizationId: DEV_ORG_ID,
      clientId: client.id,
      name: "Test Workstation",
      type: "WORKSTATION",
      hostname: "test-ws.local",
      authorizationStatus: "PENDING",
      monitoringStatus: "ACTIVE",
    },
  });

  readiness = await calculateClientReadiness(DEV_ORG_ID, client.id);
  check("Has assets check passes", !!readiness?.checks.find((c) => c.key === "assets")?.passed);

  let wazuh = await calculateWazuhReadiness(DEV_ORG_ID, client.id);
  check(
    "Wazuh not configured until endpoint authorized",
    wazuh?.status === "NOT_CONFIGURED",
    wazuh?.status
  );

  await prisma.asset.update({
    where: { id: asset.id },
    data: { authorizationStatus: "AUTHORIZED" },
  });
  wazuh = await calculateWazuhReadiness(DEV_ORG_ID, client.id);
  check(
    "Wazuh setup required (authorized, no enrollment/mapping)",
    wazuh?.status === "SETUP_REQUIRED",
    wazuh?.status
  );

  // Harborline wazuh connected
  if (harborline) {
    const hWazuh = await calculateWazuhReadiness(DEV_ORG_ID, harborline.id);
    check(
      "Harborline Wazuh CONNECTED",
      hWazuh?.status === "CONNECTED",
      `mapped=${hWazuh?.mappedAgentCount}`
    );
  }

  // Complete onboarding only when READY
  readiness = await calculateClientReadiness(DEV_ORG_ID, client.id);
  if (readiness?.overall !== "READY") {
    let completeBlocked = false;
    try {
      await completeClientOnboarding(DEV_ORG_ID, client.id);
    } catch {
      completeBlocked = true;
    }
    check("Complete blocked when not READY", completeBlocked);
  } else {
    await completeClientOnboarding(DEV_ORG_ID, client.id);
    const done = await getOrCreateClientOnboarding(DEV_ORG_ID, client.id);
    check("Onboarding completed", done?.status === "COMPLETED");
  }

  if (
    (await getOrCreateClientOnboarding(DEV_ORG_ID, client.id))?.status !==
    "COMPLETED"
  ) {
    await updateClientOnboardingStep(DEV_ORG_ID, client.id, {
      step: "REVIEW",
    }).catch(() => null);
  }

  // Activate via lifecycle from ONBOARDING
  await transitionClientStatus(DEV_ORG_ID, client.id, "ACTIVE");
  let fresh = await getClientById(DEV_ORG_ID, client.id);
  check("Activate client", fresh?.status === "ACTIVE");

  await transitionClientStatus(DEV_ORG_ID, client.id, "SUSPENDED");
  fresh = await getClientById(DEV_ORG_ID, client.id);
  check("Suspend client", fresh?.status === "SUSPENDED");

  await transitionClientStatus(DEV_ORG_ID, client.id, "ACTIVE");
  check(
    "Resume suspended",
    (await getClientById(DEV_ORG_ID, client.id))?.status === "ACTIVE"
  );

  // Offboard preserves data
  const findingCountBefore = await prisma.finding.count({
    where: { organizationId: DEV_ORG_ID },
  });
  const eventCountBefore = await prisma.securityEvent.count({
    where: { organizationId: DEV_ORG_ID },
  });
  const incidentBefore = await prisma.incident.findFirst({
    where: { organizationId: DEV_ORG_ID, caseNumber: "INC-2026-000001" },
  });

  await archiveClient(DEV_ORG_ID, client.id);
  fresh = await getClientById(DEV_ORG_ID, client.id);
  check("Offboard → OFFBOARDED", fresh?.status === "OFFBOARDED");

  const assetStill = await prisma.asset.findFirst({ where: { id: asset.id } });
  check("Offboard preserves assets", !!assetStill);

  const findingCountAfter = await prisma.finding.count({
    where: { organizationId: DEV_ORG_ID },
  });
  const eventCountAfter = await prisma.securityEvent.count({
    where: { organizationId: DEV_ORG_ID },
  });
  const incidentAfter = await prisma.incident.findFirst({
    where: { organizationId: DEV_ORG_ID, caseNumber: "INC-2026-000001" },
  });
  check("Findings preserved", findingCountBefore === findingCountAfter);
  check("SecurityEvents preserved", eventCountBefore === eventCountAfter);
  check("INC-2026-000001 preserved", !!incidentAfter && !!incidentBefore);

  // Invalid transition from OFFBOARDED to ONBOARDING
  let invalidBlocked = false;
  try {
    assertClientLifecycleTransition("OFFBOARDED", "ONBOARDING");
  } catch {
    invalidBlocked = true;
  }
  check("OFFBOARDED→ONBOARDING blocked", invalidBlocked);

  // Multi-tenancy: other org cannot access
  await prisma.organization.upsert({
    where: { id: OTHER_ORG },
    create: { id: OTHER_ORG, name: "Isolation Org", slug: "isolation-org-onb" },
    update: {},
  });
  const cross = await verifyClientOrganizationAccess(OTHER_ORG, client.id);
  check("Cross-org client access blocked", cross === false);

  const crossContacts = await listClientContacts(OTHER_ORG, client.id);
  check("Cross-org contacts empty", crossContacts.length === 0);

  const crossServices = await listClientServices(OTHER_ORG, client.id);
  check("Cross-org services empty", crossServices.length === 0);

  const crossReady = await calculateClientReadiness(OTHER_ORG, client.id);
  check("Cross-org readiness null", crossReady === null);

  // Contact update still org scoped
  if (contact) {
    const updated = await updateClientContact(OTHER_ORG, contact.id, {
      name: "Hacker",
    });
    check("Cross-org contact update blocked", updated === null);
  }

  // Cleanup temp asset only (keep client as OFFBOARDED for audit trail)
  await prisma.asset.delete({ where: { id: asset.id } }).catch(() => null);

  // Existing clients not wrongly offboarded
  const stillActive = await prisma.client.count({
    where: { organizationId: DEV_ORG_ID, status: "ACTIVE" },
  });
  check("Existing ACTIVE clients remain", stillActive >= 3, `count=${stillActive}`);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
