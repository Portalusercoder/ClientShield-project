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
  createSystemSuggestedGroup,
} from "../services/investigations/investigation.service";
import {
  extractAndLinkObservablesFromSecurityEvent,
} from "../services/investigations/observable.service";
import {
  generateCandidatesForEvent,
  listPendingCandidates,
} from "../services/investigations/correlation.service";
import {
  areSameClientCohort,
  assertUniformClientIds,
} from "../lib/client-isolation";

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

  // Same-org, different-client event must not join the investigation
  const clientB = await prisma.client.create({
    data: {
      organizationId: TEST_ORG,
      name: "Invest Client B",
      slug: "invest-client-b",
      status: "ACTIVE",
    },
  });
  const assetB = await prisma.asset.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientB.id,
      name: "Invest Asset B",
      type: "SERVER",
      environment: "PRODUCTION",
      criticality: "MEDIUM",
      monitoringStatus: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
    },
  });
  const seOtherClient = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientB.id,
      assetId: assetB.id,
      source: "WAZUH",
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      title: "Other Client Event",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `invest-other-client-${Date.now()}`,
      agentId: "002",
    },
  });
  let crossClientAddBlocked = false;
  try {
    await addEvent({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      groupId: group.id,
      securityEventId: seOtherClient.id,
    });
  } catch (err) {
    crossClientAddBlocked =
      err instanceof Error &&
      err.message.includes("Cross-client linking is not allowed");
  }
  assert(crossClientAddBlocked, "Cross-client investigation addEvent blocked");
  const stillSameClientOnly = await prisma.investigationGroupEvent.count({
    where: { groupId: group.id, removedAt: null },
  });
  assert(stillSameClientOnly === 2, "Cross-client event not linked to investigation");

  let crossClientCreateBlocked = false;
  try {
    await createInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      data: {
        title: "Mixed clients should fail",
        securityEventIds: [se1.id, seOtherClient.id],
      },
    });
  } catch (err) {
    crossClientCreateBlocked =
      err instanceof Error &&
      err.message.includes("Cross-client linking is not allowed");
  }
  assert(crossClientCreateBlocked, "Cross-client investigation create blocked");

  // --- Client cohort correlation isolation (A–H) ---
  console.log("\nClient cohort correlation isolation");

  // Helper unit checks for isolation helpers (supports H-style regressions)
  let helperAbFailed = false;
  try {
    assertUniformClientIds(["client-a", "client-b"], "helper A+B");
  } catch {
    helperAbFailed = true;
  }
  assert(helperAbFailed, "Helper rejects Client A + Client B set");
  let helperANullFailed = false;
  try {
    assertUniformClientIds(["client-a", null], "helper A+null");
  } catch {
    helperANullFailed = true;
  }
  assert(helperANullFailed, "Helper rejects Client A + null set");
  assert(
    assertUniformClientIds([null, null], "helper null") === null,
    "Helper allows fully null/unattributed set"
  );
  assert(
    assertUniformClientIds(["client-a", "client-a"], "helper A") === "client-a",
    "Helper allows fully Client A set"
  );
  assert(
    areSameClientCohort("a", "a") &&
      areSameClientCohort(null, null) &&
      !areSameClientCohort("a", "b") &&
      !areSameClientCohort("a", null),
    "areSameClientCohort cohort rules"
  );

  const sharedSignals = {
    sourceIp: "198.51.100.77",
    username: "corr-user",
    processName: "corr-evil.bin",
    mitreTechniques: ["T1059.001"],
    severity: "HIGH" as const,
    status: "NEW" as const,
    classification: "ACTIONABLE" as const,
    source: "WAZUH" as const,
  };

  const assetA2 = await prisma.asset.create({
    data: {
      organizationId: TEST_ORG,
      clientId: client.id,
      name: "Invest Asset A2",
      type: "SERVER",
      environment: "PRODUCTION",
      criticality: "HIGH",
      monitoringStatus: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
    },
  });

  const seCorrA1 = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: client.id,
      assetId: asset.id,
      title: "Corr Client A host1",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `corr-a1-${Date.now()}`,
      agentId: "001",
      ...sharedSignals,
    },
  });
  const seCorrA2 = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: client.id,
      assetId: assetA2.id,
      title: "Corr Client A host2",
      firstSeenAt: now,
      lastSeenAt: new Date(now.getTime() - 2 * 60_000),
      correlationKey: `corr-a2-${Date.now()}`,
      agentId: "002",
      ...sharedSignals,
    },
  });
  const seCorrB1 = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: clientB.id,
      assetId: assetB.id,
      title: "Corr Client B host",
      firstSeenAt: now,
      lastSeenAt: new Date(now.getTime() - 1 * 60_000),
      correlationKey: `corr-b1-${Date.now()}`,
      agentId: "010",
      ...sharedSignals,
    },
  });
  const seCorrNull1 = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: null,
      assetId: null,
      title: "Corr null host1",
      firstSeenAt: now,
      lastSeenAt: now,
      correlationKey: `corr-null1-${Date.now()}`,
      agentId: "000",
      ...sharedSignals,
    },
  });
  const seCorrNull2 = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG,
      clientId: null,
      assetId: null,
      title: "Corr null host2",
      firstSeenAt: now,
      lastSeenAt: new Date(now.getTime() - 90_000),
      correlationKey: `corr-null2-${Date.now()}`,
      agentId: "099",
      ...sharedSignals,
    },
  });

  // A: Client A vs Client B — no candidate
  await generateCandidatesForEvent(TEST_ORG, seCorrA1.id);
  const abCand = await prisma.correlationCandidate.count({
    where: {
      organizationId: TEST_ORG,
      OR: [
        { eventAId: seCorrA1.id, eventBId: seCorrB1.id },
        { eventAId: seCorrB1.id, eventBId: seCorrA1.id },
      ],
    },
  });
  assert(abCand === 0, "A: no Client A↔Client B correlation candidate");

  // B: Client A vs null — no mixed candidate
  const aNullCand = await prisma.correlationCandidate.count({
    where: {
      organizationId: TEST_ORG,
      OR: [
        { eventAId: seCorrA1.id, eventBId: seCorrNull1.id },
        { eventAId: seCorrNull1.id, eventBId: seCorrA1.id },
      ],
    },
  });
  assert(aNullCand === 0, "B: no Client A↔null correlation candidate");

  // C: two null-client events — allowed when scoring qualifies
  const nullCandResult = await generateCandidatesForEvent(
    TEST_ORG,
    seCorrNull2.id
  );
  const nullPair = await prisma.correlationCandidate.count({
    where: {
      organizationId: TEST_ORG,
      OR: [
        { eventAId: seCorrNull1.id, eventBId: seCorrNull2.id },
        { eventAId: seCorrNull2.id, eventBId: seCorrNull1.id },
      ],
    },
  });
  assert(
    nullPair >= 1 || nullCandResult.created >= 1,
    "C: null↔null correlation candidate created when score qualifies"
  );

  // D: same client, different assets — allowed
  const multiAssetResult = await generateCandidatesForEvent(
    TEST_ORG,
    seCorrA2.id
  );
  const multiAssetCand = await prisma.correlationCandidate.count({
    where: {
      organizationId: TEST_ORG,
      OR: [
        { eventAId: seCorrA1.id, eventBId: seCorrA2.id },
        { eventAId: seCorrA2.id, eventBId: seCorrA1.id },
      ],
    },
  });
  assert(
    multiAssetCand >= 1 || multiAssetResult.created >= 1,
    "D: same-client multi-asset correlation candidate created"
  );

  // E: SYSTEM_SUGGESTED Client A group must not expand with Client B
  const sysA = await prisma.investigationGroup.create({
    data: {
      organizationId: TEST_ORG,
      clientId: client.id,
      assetId: asset.id,
      title: "System suggested Client A isolation",
      status: "OPEN",
      severity: "HIGH",
      createdByType: "SYSTEM_SUGGESTED",
      confidence: "HIGH",
      fingerprint: `sys-iso-a-${Date.now()}`,
      groupingExplanation: "test isolation group",
      events: {
        create: [
          {
            organizationId: TEST_ORG,
            securityEventId: seCorrA1.id,
            addReason: "seed",
          },
          {
            organizationId: TEST_ORG,
            securityEventId: seCorrA2.id,
            addReason: "seed",
          },
        ],
      },
    },
  });
  const beforeE = await prisma.investigationGroupEvent.count({
    where: { groupId: sysA.id, removedAt: null },
  });
  // Propose Client B pair (eligible via very strong signal) — must not merge into Client A
  await createSystemSuggestedGroup({
    organizationId: TEST_ORG,
    eventIds: [seCorrB1.id, seOtherClient.id],
    reasons: ["test Client B suggestion"],
    confidence: "HIGH",
    hasVeryStrongSignal: true,
    signalFamilies: ["HASH", "IP"],
  });
  const afterE = await prisma.investigationGroupEvent.count({
    where: { groupId: sysA.id, removedAt: null },
  });
  assert(afterE === beforeE, "E: Client A system group not expanded with Client B");
  const eHasB = await prisma.investigationGroupEvent.count({
    where: {
      groupId: sysA.id,
      removedAt: null,
      securityEventId: { in: [seCorrB1.id, seOtherClient.id] },
    },
  });
  assert(eHasB === 0, "E: Client B events absent from Client A system group");

  // Mixed A+B proposed set must be rejected outright
  let mixedAbSuggestBlocked = false;
  try {
    await createSystemSuggestedGroup({
      organizationId: TEST_ORG,
      eventIds: [seCorrA1.id, seCorrB1.id],
      reasons: ["mixed clients"],
      confidence: "HIGH",
      hasVeryStrongSignal: true,
    });
  } catch (err) {
    mixedAbSuggestBlocked =
      err instanceof Error &&
      err.message.includes("Cross-client linking is not allowed");
  }
  assert(
    mixedAbSuggestBlocked,
    "E: createSystemSuggestedGroup rejects Client A+B set"
  );

  // F: SYSTEM_SUGGESTED Client A + null event merge/expand rejected
  const beforeF = await prisma.investigationGroupEvent.count({
    where: { groupId: sysA.id, removedAt: null },
  });
  await createSystemSuggestedGroup({
    organizationId: TEST_ORG,
    eventIds: [seCorrNull1.id, seCorrNull2.id],
    reasons: ["null cohort suggestion"],
    confidence: "HIGH",
    hasVeryStrongSignal: true,
    signalFamilies: ["HASH", "IP"],
  });
  const afterF = await prisma.investigationGroupEvent.count({
    where: { groupId: sysA.id, removedAt: null },
  });
  assert(afterF === beforeF, "F: Client A system group not expanded with null events");
  let mixedANullSuggestBlocked = false;
  try {
    await createSystemSuggestedGroup({
      organizationId: TEST_ORG,
      eventIds: [seCorrA1.id, seCorrNull1.id],
      reasons: ["mixed attributed null"],
      confidence: "HIGH",
      hasVeryStrongSignal: true,
    });
  } catch (err) {
    mixedANullSuggestBlocked =
      err instanceof Error &&
      err.message.includes("Cross-client linking is not allowed");
  }
  assert(
    mixedANullSuggestBlocked,
    "F: createSystemSuggestedGroup rejects Client A+null set"
  );

  // G: createInvestigation with Client A + null rejected
  let createANullBlocked = false;
  try {
    await createInvestigation({
      organizationId: TEST_ORG,
      actorId: TEST_USER,
      data: {
        title: "Mixed attributed and null should fail",
        securityEventIds: [se1.id, seCorrNull1.id],
      },
    });
  } catch (err) {
    createANullBlocked =
      err instanceof Error &&
      err.message.includes("Cross-client linking is not allowed");
  }
  assert(createANullBlocked, "G: createInvestigation rejects Client A + null");

  // listPendingCandidates hides invalid legacy pairs (does not delete)
  const [legacyA, legacyB] = seCorrA1.id < seCorrB1.id
    ? [seCorrA1.id, seCorrB1.id]
    : [seCorrB1.id, seCorrA1.id];
  const legacyCand = await prisma.correlationCandidate.create({
    data: {
      organizationId: TEST_ORG,
      eventAId: legacyA,
      eventBId: legacyB,
      score: 99,
      confidence: "HIGH",
      reasons: ["legacy invalid"],
      signalFamilies: ["IP"],
      qualityFactors: [],
      status: "PENDING",
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const listed = await listPendingCandidates(TEST_ORG, { pageSize: 200 });
  assert(
    !listed.items.some((i) => i.id === legacyCand.id),
    "listPendingCandidates hides cross-client legacy candidate"
  );
  assert(
    (listed.invalidLegacyCandidateCount ?? 0) >= 1,
    "listPendingCandidates reports invalid legacy candidates"
  );
  const legacyStillExists = await prisma.correlationCandidate.findUnique({
    where: { id: legacyCand.id },
  });
  assert(
    legacyStillExists?.status === "PENDING",
    "Invalid legacy candidate not deleted/mutated"
  );

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
