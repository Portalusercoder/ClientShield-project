/**
 * Option A E2E: attributed Agent 002 SecurityEvent → Investigation → Incident.
 * Uses production-like Harborline / Ubuntu records. Does NOT delete created rows.
 *
 * Run: npx tsx scripts/e2e-se-investigation-incident.ts
 */
import { PrismaClient } from "@prisma/client";
import { DEV_ORG_ID, DEV_USER_ID } from "../lib/dev-constants";
import {
  acknowledgeSecurityEvent,
  startSecurityEventReview,
  linkSecurityEventToIncident,
} from "../services/security-events.service";
import {
  addEvent,
  createIncidentFromInvestigation,
  createInvestigation,
} from "../services/investigations/investigation.service";

const prisma = new PrismaClient();

const SE_ID = "cmrw48osq02oloo9kkm2yjduu";
const HARBORLINE_CLIENT = "cmrt0apf80003oowne38x239h";
const UBUNTU_ASSET = "cmrw1714e0001ooehpezby8vc";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

async function main() {
  console.log("\n=== E2E SecurityEvent → Investigation → Incident ===\n");

  const beforeCp = await prisma.wazuhIngestionState.findUnique({
    where: { organizationId: DEV_ORG_ID },
  });
  const mappingsBefore = await prisma.wazuhAgentMapping.findMany({
    where: { organizationId: DEV_ORG_ID },
    orderBy: { wazuhAgentId: "asc" },
  });

  const se = await prisma.securityEvent.findFirst({
    where: { id: SE_ID, organizationId: DEV_ORG_ID },
  });
  assert(Boolean(se), "Source SecurityEvent exists");
  assert(se?.agentId === "002", "Agent ID is 002");
  assert(se?.clientId === HARBORLINE_CLIENT, "SE clientId = Harborline");
  assert(se?.assetId === UBUNTU_ASSET, "SE assetId = Ubuntu Remote Test VM");
  assert((se?.ruleLevel ?? 0) >= 4, "SE rule level ≥ 4");
  assert(se?.ruleId === "5557", "SE ruleId = 5557");

  if (!se) {
    throw new Error("Missing source SecurityEvent — aborting");
  }

  // Analyst triage (idempotent for re-runs)
  const triageStatus = se.status;
  if (triageStatus === "NEW") {
    await startSecurityEventReview({
      organizationId: DEV_ORG_ID,
      actorId: DEV_USER_ID,
      eventId: SE_ID,
    });
  }
  const afterReview = await prisma.securityEvent.findUniqueOrThrow({
    where: { id: SE_ID },
  });
  if (
    afterReview.status === "NEW" ||
    afterReview.status === "REVIEWING"
  ) {
    await acknowledgeSecurityEvent({
      organizationId: DEV_ORG_ID,
      actorId: DEV_USER_ID,
      eventId: SE_ID,
    });
  }
  const afterAck = await prisma.securityEvent.findUniqueOrThrow({
    where: { id: SE_ID },
  });
  assert(
    afterAck.status === "ACKNOWLEDGED" || afterAck.status === "ESCALATED",
    `SE triage status is ACKNOWLEDGED or ESCALATED (got ${afterAck.status})`
  );

  const investigation = await createInvestigation({
    organizationId: DEV_ORG_ID,
    actorId: DEV_USER_ID,
    data: {
      title:
        "[E2E-TEST] Agent 002 unix_chkpwd auth failure — Harborline Ubuntu Remote Test VM",
      summary:
        "[E2E-TEST] Manual analyst investigation from attributed Wazuh SecurityEvent cmrw48osq02oloo9kkm2yjduu. Harmless failed-sudo validation — do not treat as real breach.",
      securityEventIds: [SE_ID],
      severity: "LOW",
      groupingExplanation:
        "[E2E-TEST] Option A workflow validation: SE → Investigation → Incident",
    },
  });

  assert(Boolean(investigation.id), "Investigation created");
  assert(
    investigation.title.startsWith("[E2E-TEST]"),
    "Investigation title marked [E2E-TEST]"
  );
  assert(
    investigation.clientId === HARBORLINE_CLIENT,
    "Investigation clientId = Harborline"
  );
  assert(
    investigation.assetId === UBUNTU_ASSET,
    "Investigation assetId = Ubuntu Remote Test VM"
  );
  assert(
    investigation.organizationId === DEV_ORG_ID,
    "Investigation organizationId matches"
  );

  const invLinks = await prisma.investigationGroupEvent.findMany({
    where: { groupId: investigation.id, removedAt: null },
  });
  assert(invLinks.length === 1, "Exactly one active InvestigationGroupEvent");
  assert(
    invLinks[0]?.securityEventId === SE_ID,
    "Investigation linked to source SecurityEvent"
  );

  // Duplicate add — must remain idempotent (no second active row)
  const dupAdd = await addEvent({
    organizationId: DEV_ORG_ID,
    actorId: DEV_USER_ID,
    groupId: investigation.id,
    securityEventId: SE_ID,
  });
  const invLinksAfterDup = await prisma.investigationGroupEvent.findMany({
    where: { groupId: investigation.id },
  });
  const activeAfterDup = invLinksAfterDup.filter((l) => !l.removedAt);
  assert(activeAfterDup.length === 1, "Duplicate addEvent did not create extra link");
  assert(dupAdd.id === invLinks[0].id, "Duplicate addEvent returned same link row");

  const { incidentId } = await createIncidentFromInvestigation({
    organizationId: DEV_ORG_ID,
    actorId: DEV_USER_ID,
    groupId: investigation.id,
    title:
      "[E2E-TEST] Incident from Agent 002 unix_chkpwd — Harborline Ubuntu Remote Test VM",
    description:
      "[E2E-TEST] Explicit analyst escalation from investigation. Harmless auth-failure validation event. Not a real security breach.",
    severity: "LOW",
  });

  assert(Boolean(incidentId), "Incident created from investigation");

  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
  });
  assert(incident != null, "Incident row exists");
  if (!incident) throw new Error("Missing incident");
  assert(
    incident.title.startsWith("[E2E-TEST]"),
    "Incident title marked [E2E-TEST]"
  );
  assert(
    incident.clientId === HARBORLINE_CLIENT,
    "Incident clientId = Harborline"
  );
  assert(
    incident.assetId === UBUNTU_ASSET,
    "Incident assetId = Ubuntu Remote Test VM"
  );
  assert(
    incident.organizationId === DEV_ORG_ID,
    "Incident organizationId matches"
  );

  const seIncidentLinks = await prisma.incidentSecurityEvent.findMany({
    where: { incidentId, securityEventId: SE_ID },
  });
  assert(seIncidentLinks.length === 1, "Exactly one IncidentSecurityEvent link");

  const groupIncidentLinks = await prisma.investigationGroupIncident.findMany({
    where: { groupId: investigation.id, incidentId },
  });
  assert(
    groupIncidentLinks.length >= 1,
    "Investigation linked to Incident"
  );

  // Traceability chain
  const chainSe = await prisma.securityEvent.findUnique({
    where: { id: SE_ID },
    include: {
      investigationGroupEvents: {
        where: { removedAt: null, groupId: investigation.id },
      },
      incidents: { where: { incidentId } },
    },
  });
  assert(
    (chainSe?.investigationGroupEvents.length ?? 0) === 1,
    "SE → Investigation traceability"
  );
  assert(
    (chainSe?.incidents.length ?? 0) === 1,
    "SE → Incident traceability"
  );
  assert(
    chainSe?.status === "ESCALATED",
    `SE status ESCALATED after incident (got ${chainSe?.status})`
  );

  // Duplicate IncidentSecurityEvent blocked
  let dupIncidentLinkBlocked = false;
  try {
    await linkSecurityEventToIncident({
      organizationId: DEV_ORG_ID,
      actorId: DEV_USER_ID,
      data: { securityEventId: SE_ID, incidentId },
    });
  } catch (err) {
    dupIncidentLinkBlocked =
      err instanceof Error &&
      err.message.toLowerCase().includes("already linked");
  }
  assert(dupIncidentLinkBlocked, "Duplicate IncidentSecurityEvent link blocked");
  const seIncidentLinksAfter = await prisma.incidentSecurityEvent.count({
    where: { incidentId, securityEventId: SE_ID },
  });
  assert(seIncidentLinksAfter === 1, "Still exactly one SE↔Incident link");

  // Regression: mappings + checkpoint
  const mappingsAfter = await prisma.wazuhAgentMapping.findMany({
    where: { organizationId: DEV_ORG_ID },
    orderBy: { wazuhAgentId: "asc" },
  });
  assert(
    !mappingsAfter.some((m) => m.wazuhAgentId === "000"),
    "Agent 000 still unmapped"
  );
  const m001b = mappingsBefore.find((m) => m.wazuhAgentId === "001");
  const m001a = mappingsAfter.find((m) => m.wazuhAgentId === "001");
  assert(
    m001b?.id === m001a?.id &&
      m001a?.status === "ACTIVE" &&
      m001a?.assetId === "cmrukac2o0001ooij4njfqqi4",
    "Agent 001 mapping unchanged"
  );
  const m002b = mappingsBefore.find((m) => m.wazuhAgentId === "002");
  const m002a = mappingsAfter.find((m) => m.wazuhAgentId === "002");
  assert(
    m002b?.id === m002a?.id &&
      m002a?.status === "ACTIVE" &&
      m002a?.assetId === UBUNTU_ASSET &&
      m002a?.clientId === HARBORLINE_CLIENT,
    "Agent 002 mapping unchanged"
  );

  const afterCp = await prisma.wazuhIngestionState.findUnique({
    where: { organizationId: DEV_ORG_ID },
  });
  assert(Boolean(afterCp), "Ingestion state present");
  if (beforeCp?.lastTimestamp && afterCp?.lastTimestamp) {
    assert(
      afterCp.lastTimestamp.getTime() >= beforeCp.lastTimestamp.getTime(),
      "Ingestion checkpoint not reset backward"
    );
  }
  assert(
    beforeCp?.lastDocumentId == null ||
      afterCp?.lastDocumentId != null,
    "Checkpoint document id preserved or advanced"
  );

  console.log("\n--- E2E chain IDs ---");
  console.log(
    JSON.stringify(
      {
        securityEventId: SE_ID,
        investigationId: investigation.id,
        incidentId,
        caseNumber: incident?.caseNumber ?? null,
        clientId: HARBORLINE_CLIENT,
        assetId: UBUNTU_ASSET,
        checkpointBefore: {
          lastTimestamp: beforeCp?.lastTimestamp?.toISOString() ?? null,
          lastDocumentId: beforeCp?.lastDocumentId ?? null,
        },
        checkpointAfter: {
          lastTimestamp: afterCp?.lastTimestamp?.toISOString() ?? null,
          lastDocumentId: afterCp?.lastDocumentId ?? null,
          workerId: afterCp?.workerId ?? null,
          lastError: afterCp?.lastError ?? null,
        },
      },
      null,
      2
    )
  );

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
