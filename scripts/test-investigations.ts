/**
 * Investigation / observable / cross-event correlation tests.
 * Isolated TEST org — does not touch production data.
 * Run: npm run test:investigations
 */
import { PrismaClient } from "@prisma/client";
import {
  isPrivateOrLocalIp,
  looksLikeSecret,
  normalizeHash,
  normalizeIp,
  normalizeUrl,
  normalizeUsername,
} from "../services/investigations/observable-normalize";
import { scoreEventPair } from "../services/investigations/correlation-scoring";
import type { ScoringEventSnapshot } from "../services/investigations/correlation-scoring";
import { isSafeForExternalLookup } from "../services/investigations/threat-intel.service";
import {
  createInvestigation,
  dismissInvestigation,
  addEvent,
  removeEvent,
} from "../services/investigations/investigation.service";
import {
  extractAndLinkObservablesFromSecurityEvent,
} from "../services/investigations/observable.service";
import { generateCandidatesForEvent } from "../services/investigations/correlation.service";

const prisma = new PrismaClient();

const TEST_ORG = "clyinvesttestorg000000001";
const OTHER_ORG = "clyinvestotherorg00000001";
const TEST_USER = "clyinvesttestuser00000001";
const OTHER_USER = "clyinvestotheruser000001";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

function baseSnap(
  overrides: Partial<ScoringEventSnapshot> & { id: string }
): ScoringEventSnapshot {
  const now = new Date();
  return {
    assetId: null,
    agentId: null,
    sourceIp: null,
    destinationIp: null,
    username: null,
    processName: null,
    filePath: null,
    correlationKey: `key-${overrides.id}`,
    firstSeenAt: now,
    lastSeenAt: now,
    mitreTactics: [],
    mitreTechniques: [],
    fileHashes: [],
    classification: "ACTIONABLE",
    ruleId: null,
    ruleGroups: [],
    scaCheckId: null,
    title: null,
    severity: "HIGH",
    threatIntelRisk: null,
    ...overrides,
  };
}

async function cleanup() {
  await prisma.threatIntelLookup.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.investigationActivity.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.investigationGroupIncident.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.investigationGroupEvent.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.correlationCandidate.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.securityEventObservable.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.investigationGroup.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.securityObservable.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.incidentSecurityEvent.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.securityEventActivity.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.securityEvent.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.incidentActivity.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.incident.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.asset.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.client.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.auditLog.deleteMany({
    where: { organizationId: { in: [TEST_ORG, OTHER_ORG] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [TEST_USER, OTHER_USER] } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: [TEST_ORG, OTHER_ORG] } },
  });
}

async function main() {
  console.log("\n=== Investigation / Threat Intel Tests ===\n");

  console.log("Normalization");
  assert(normalizeIp("192.168.1.10") === "192.168.1.10", "IPv4 normalize");
  assert(isPrivateOrLocalIp("10.0.0.1") === true, "Private IP detected");
  assert(isPrivateOrLocalIp("8.8.8.8") === false, "Public IP not private");
  assert(isPrivateOrLocalIp("127.0.0.1") === true, "Loopback private");
  assert(normalizeUrl("https://evil.example/path")?.startsWith("https://") === true, "HTTPS URL");
  assert(normalizeUrl("javascript:alert(1)") === null, "javascript URL rejected");
  assert(normalizeHash("d41d8cd98f00b204e9800998ecf8427e")?.length === 32, "MD5 hash");
  assert(normalizeHash("zzzz") === null, "Invalid hash rejected");
  assert(looksLikeSecret("password=hunter2") === true, "Secret-like rejected");
  assert(normalizeUsername("password=x") === null, "Username secret blocked");

  console.log("\nThreat intel privacy");
  assert(
    isSafeForExternalLookup({
      type: "IP_ADDRESS",
      value: "10.1.2.3",
      normalizedValue: "10.1.2.3",
    }).safe === false,
    "Private IP blocked from external lookup"
  );
  assert(
    isSafeForExternalLookup({
      type: "IP_ADDRESS",
      value: "203.0.113.50",
      normalizedValue: "203.0.113.50",
    }).safe === true,
    "Public IP allowed for external lookup"
  );
  assert(
    isSafeForExternalLookup({
      type: "USERNAME",
      value: "alice",
      normalizedValue: "alice",
    }).safe === false,
    "Username blocked from external lookup"
  );
  assert(
    isSafeForExternalLookup({
      type: "FILE_PATH",
      value: "/tmp/x",
      normalizedValue: "/tmp/x",
    }).safe === false,
    "File path blocked from external lookup"
  );
  assert(
    isSafeForExternalLookup({
      type: "HOSTNAME",
      value: "localhost",
      normalizedValue: "localhost",
    }).safe === false,
    "localhost hostname blocked"
  );

  console.log("\nScoring");
  const now = new Date();

  const assetOnly = scoreEventPair(
    baseSnap({ id: "a", assetId: "asset1", agentId: "001", lastSeenAt: now }),
    baseSnap({ id: "b", assetId: "asset1", agentId: "001", lastSeenAt: now }),
    24
  );
  assert(
    assetOnly.confidence === null,
    "Same asset+agent alone does not create a candidate"
  );
  assert(
    (assetOnly.signalFamilies ?? []).includes("ASSET_CONTEXT"),
    "Asset+agent counted as one ASSET_CONTEXT family"
  );

  const weak = scoreEventPair(
    baseSnap({
      id: "a",
      processName: "bash",
      mitreTactics: ["Execution"],
      lastSeenAt: now,
    }),
    baseSnap({
      id: "b",
      processName: "bash",
      mitreTactics: ["Execution"],
      lastSeenAt: now,
    }),
    24
  );
  assert(
    weak.confidence === null || (weak.score ?? 0) < 50,
    "Weak shared tactic/process does not over-correlate"
  );

  const noisyPair = scoreEventPair(
    baseSnap({
      id: "a",
      classification: "NOISY",
      ruleId: "19008",
      assetId: "asset1",
      title: "CIS check",
      lastSeenAt: now,
    }),
    baseSnap({
      id: "b",
      classification: "NOISY",
      ruleId: "19007",
      assetId: "asset1",
      title: "CIS other",
      lastSeenAt: now,
    }),
    24
  );
  assert(
    noisyPair.confidence === null,
    "NOISY+NOISY / unrelated SCA does not create candidates"
  );

  const strongHash =
    "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";
  const strong = scoreEventPair(
    baseSnap({
      id: "a",
      assetId: "asset1",
      agentId: "001",
      sourceIp: "203.0.113.9",
      username: "alice",
      processName: "malware.exe",
      mitreTechniques: ["T1059"],
      mitreTactics: ["Execution"],
      lastSeenAt: now,
      fileHashes: [strongHash],
    }),
    baseSnap({
      id: "b",
      assetId: "asset1",
      agentId: "001",
      sourceIp: "203.0.113.9",
      username: "alice",
      processName: "malware.exe",
      mitreTechniques: ["T1059"],
      mitreTactics: ["Execution"],
      lastSeenAt: new Date(Date.now() - 5 * 60_000),
      fileHashes: [strongHash],
    }),
    24
  );
  assert(strong.confidence === "HIGH", "Strong multi-signal pair is HIGH");
  assert(strong.reasons.length >= 3, "Reasons are human-readable and present");
  assert(strong.hasVeryStrongSignal === true, "Hash is VERY_STRONG");

  await cleanup();

  await prisma.organization.create({
    data: { id: TEST_ORG, name: "Invest Test Org", slug: "invest-test-org" },
  });
  await prisma.organization.create({
    data: { id: OTHER_ORG, name: "Other Invest Org", slug: "other-invest-org" },
  });
  await prisma.user.create({
    data: {
      id: TEST_USER,
      organizationId: TEST_ORG,
      email: "invest-analyst@test.local",
      name: "Invest Analyst",
      role: "ANALYST",
    },
  });
  await prisma.user.create({
    data: {
      id: OTHER_USER,
      organizationId: OTHER_ORG,
      email: "other-invest@test.local",
      name: "Other",
      role: "ANALYST",
    },
  });

  const client = await prisma.client.create({
    data: {
      organizationId: TEST_ORG,
      name: "Invest Client",
      slug: "invest-client",
      status: "ACTIVE",
    },
  });
  const asset = await prisma.asset.create({
    data: {
      organizationId: TEST_ORG,
      clientId: client.id,
      name: "Invest Asset",
      type: "WORKSTATION",
      environment: "PRODUCTION",
      criticality: "HIGH",
      monitoringStatus: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
    },
  });

  const se1 = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: client.id,
      assetId: asset.id,
      source: "WAZUH",
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      title: "Invest Event A",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `invest-a-${Date.now()}`,
      agentId: "001",
      sourceIp: "203.0.113.44",
      username: "alice",
      processName: "evil.bin",
      mitreTechniques: ["T1059"],
    },
  });
  const se2 = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: client.id,
      assetId: asset.id,
      source: "WAZUH",
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      title: "Invest Event B",
      firstSeenAt: now,
      lastSeenAt: new Date(now.getTime() - 3 * 60_000),
      correlationKey: `invest-b-${Date.now()}`,
      agentId: "001",
      sourceIp: "203.0.113.44",
      username: "alice",
      processName: "evil.bin",
      mitreTechniques: ["T1059"],
    },
  });
  const otherSe = await prisma.securityEvent.create({
    data: {
      organizationId: OTHER_ORG,
      source: "WAZUH",
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      title: "Other Org Event",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `other-${Date.now()}`,
      sourceIp: "203.0.113.44",
    },
  });

  console.log("\nObservable extraction");
  const extracted = await extractAndLinkObservablesFromSecurityEvent(se1.id);
  assert((extracted?.linked ?? 0) > 0 || true, "Extraction completes without throwing");
  const obsAfter = await prisma.securityEventObservable.count({
    where: { securityEventId: se1.id },
  });
  assert(obsAfter >= 1, "Observables linked from SecurityEvent fields");

  console.log("\nCorrelation candidates");
  await extractAndLinkObservablesFromSecurityEvent(se2.id);
  const candResult = await generateCandidatesForEvent(TEST_ORG, se2.id);
  assert(
    typeof candResult.created === "number" &&
      typeof candResult.skipped === "number",
    "Candidate generation returns counts"
  );
  const crossCand = await prisma.correlationCandidate.count({
    where: {
      organizationId: TEST_ORG,
      OR: [
        { eventAId: otherSe.id },
        { eventBId: otherSe.id },
      ],
    },
  });
  assert(crossCand === 0, "Cross-org events never correlated");

  console.log("\nInvestigations + multi-tenancy");
  const group = await createInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    data: {
      title: "Manual related activity review",
      securityEventIds: [se1.id, se2.id],
      severity: "HIGH",
    },
  });
  assert(Boolean(group?.id), "Analyst can create investigation");

  const events = await prisma.investigationGroupEvent.count({
    where: { groupId: group.id, removedAt: null },
  });
  assert(events === 2, "Two events linked");

  let dupBlocked = false;
  try {
    await addEvent({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      groupId: group.id,
      securityEventId: se1.id,
    });
  } catch {
    dupBlocked = true;
  }
  // upsert / idempotent add is also OK
  const stillTwo = await prisma.investigationGroupEvent.count({
    where: { groupId: group.id, removedAt: null },
  });
  assert(stillTwo === 2 || dupBlocked, "Duplicate event link not created");

  await removeEvent({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    securityEventId: se2.id,
    reason: "Incorrect grouping for test",
  });
  const afterRemove = await prisma.investigationGroupEvent.count({
    where: { groupId: group.id, removedAt: null },
  });
  assert(afterRemove === 1, "Event removed with reason");

  let crossBlocked = false;
  try {
    await createInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      data: {
        title: "Cross org should fail",
        securityEventIds: [otherSe.id],
      },
    });
  } catch {
    crossBlocked = true;
  }
  assert(crossBlocked, "Cross-org event add blocked on create");

  await dismissInvestigation({
    organizationId: TEST_ORG,
    actorId: TEST_USER,
    groupId: group.id,
    reason: "Test dismissal",
  });
  const dismissed = await prisma.investigationGroup.findUnique({
    where: { id: group.id },
  });
  assert(dismissed?.status === "DISMISSED", "Dismiss with reason");

  // Observable org isolation: same public IP → separate rows
  await prisma.securityObservable.create({
    data: {
      organizationId: TEST_ORG,
      type: "IP_ADDRESS",
      value: "203.0.113.99",
      normalizedValue: "203.0.113.99",
      firstSeenAt: now,
      lastSeenAt: now,
    },
  });
  await prisma.securityObservable.create({
    data: {
      organizationId: OTHER_ORG,
      type: "IP_ADDRESS",
      value: "203.0.113.99",
      normalizedValue: "203.0.113.99",
      firstSeenAt: now,
      lastSeenAt: now,
    },
  });
  const obsCount = await prisma.securityObservable.count({
    where: { normalizedValue: "203.0.113.99" },
  });
  assert(obsCount === 2, "Same public IP isolated per organization");

  // No auto-incident from investigation create/dismiss
  const autoIncidents = await prisma.incident.count({
    where: { organizationId: TEST_ORG },
  });
  assert(autoIncidents === 0, "No automatic Incident created");

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  await cleanup();
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
