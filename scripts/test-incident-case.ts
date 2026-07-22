/**
 * Incident Case Management tests.
 * Uses isolated TEST org — does not touch production data.
 * Requires migration 20260722100000_incident_case_management applied.
 * Run with: npm run test:incident-case
 */
import { PrismaClient } from "@prisma/client";
import {
  assignPlaybookSchema,
  closeIncidentCaseSchema,
  setResponseTaskStatusSchema,
} from "../lib/validations/incident-case";
import { assertCanCloseIncident } from "../services/incidents/closure.service";
import { allocateNextCaseNumber } from "../services/incidents/case-number.service";
import {
  addNoteEvidence,
  assertValidEvidenceUrl,
  linkFindingEvidence,
  linkSecurityEventEvidence,
  listEvidence,
} from "../services/incidents/evidence.service";
import { setCommander, setLeadAnalyst } from "../services/incidents/ownership.service";
import {
  assignPlaybookToIncident,
  ensureSystemPlaybooksExist,
  listPlaybooks,
  suggestPlaybook,
} from "../services/incidents/playbook.service";
import {
  assignResponseTask,
  createResponseTask,
  listResponseTasks,
  setResponseTaskStatus,
} from "../services/incidents/response-task.service";
import {
  createIncident,
  updateIncidentStatus,
} from "../services/incidents.service";

const prisma = new PrismaClient();

const TEST_ORG_ID = "clycasetestorg00000000001";
const TEST_USER_ID = "clycasetestuser000000001";
const TEST_ADMIN_ID = "clycasetestadmin00000001";
const OTHER_ORG_ID = "clycaseotherorg000000001";
const OTHER_USER_ID = "clycaseotheruser0000001";

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

async function cleanup() {
  await prisma.incidentEvidence.deleteMany({
    where: { organizationId: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
  await prisma.incidentResponseTask.deleteMany({
    where: { organizationId: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
  await prisma.incidentPlaybookInstance.deleteMany({
    where: { organizationId: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
  await prisma.incidentFinding.deleteMany({
    where: { organizationId: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
  await prisma.incidentSecurityEvent.deleteMany({
    where: { organizationId: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
  await prisma.incidentNote.deleteMany({
    where: { organizationId: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
  await prisma.incidentActivity.deleteMany({
    where: { organizationId: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
  await prisma.incident.deleteMany({
    where: { organizationId: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
  await prisma.incidentCaseSequence.deleteMany({
    where: { organizationId: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
  await prisma.securityEvent.deleteMany({
    where: { organizationId: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
  await prisma.finding.deleteMany({
    where: { organizationId: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
  await prisma.asset.deleteMany({
    where: { organizationId: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
  await prisma.client.deleteMany({
    where: { organizationId: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
  await prisma.auditLog.deleteMany({
    where: { organizationId: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [TEST_USER_ID, TEST_ADMIN_ID, OTHER_USER_ID] } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
}

async function setup() {
  await cleanup();

  await prisma.organization.create({
    data: {
      id: TEST_ORG_ID,
      name: "Case Test Org",
      slug: "case-test-org-cly",
    },
  });
  await prisma.organization.create({
    data: {
      id: OTHER_ORG_ID,
      name: "Other Case Org",
      slug: "other-case-org-cly",
    },
  });
  await prisma.user.create({
    data: {
      id: TEST_USER_ID,
      organizationId: TEST_ORG_ID,
      email: "case-analyst@test.local",
      name: "Case Analyst",
      role: "ANALYST",
    },
  });
  await prisma.user.create({
    data: {
      id: TEST_ADMIN_ID,
      organizationId: TEST_ORG_ID,
      email: "case-admin@test.local",
      name: "Case Admin",
      role: "ADMIN",
    },
  });
  await prisma.user.create({
    data: {
      id: OTHER_USER_ID,
      organizationId: OTHER_ORG_ID,
      email: "other-case@test.local",
      name: "Other Analyst",
      role: "ANALYST",
    },
  });

  const client = await prisma.client.create({
    data: {
      organizationId: TEST_ORG_ID,
      name: "Case Test Client",
      slug: "case-test-client-cly",
      status: "ACTIVE",
    },
  });
  const otherClient = await prisma.client.create({
    data: {
      organizationId: OTHER_ORG_ID,
      name: "Other Case Client",
      slug: "other-case-client-cly",
      status: "ACTIVE",
    },
  });
  const asset = await prisma.asset.create({
    data: {
      organizationId: TEST_ORG_ID,
      clientId: client.id,
      name: "Case Test Asset",
      type: "WEBSITE",
      url: "https://case-test.example",
      environment: "PRODUCTION",
      criticality: "HIGH",
      monitoringStatus: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
    },
  });
  const otherAsset = await prisma.asset.create({
    data: {
      organizationId: OTHER_ORG_ID,
      clientId: otherClient.id,
      name: "Other Case Asset",
      type: "WEBSITE",
      url: "https://other-case.example",
      environment: "PRODUCTION",
      criticality: "MEDIUM",
      monitoringStatus: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
    },
  });
  const finding = await prisma.finding.create({
    data: {
      organizationId: TEST_ORG_ID,
      clientId: client.id,
      assetId: asset.id,
      title: "Case Test Finding",
      severity: "HIGH",
      status: "OPEN",
      source: "MANUAL",
    },
  });
  const otherFinding = await prisma.finding.create({
    data: {
      organizationId: OTHER_ORG_ID,
      clientId: otherClient.id,
      assetId: otherAsset.id,
      title: "Other Org Finding",
      severity: "HIGH",
      status: "OPEN",
      source: "MANUAL",
    },
  });
  const securityEvent = await prisma.securityEvent.create({
    data: {
      organizationId: TEST_ORG_ID,
      clientId: client.id,
      assetId: asset.id,
      source: "WAZUH",
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      title: "Case Test Security Event",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      correlationKey: `case-test-corr-${Date.now()}`,
    },
  });
  const otherSecurityEvent = await prisma.securityEvent.create({
    data: {
      organizationId: OTHER_ORG_ID,
      clientId: otherClient.id,
      source: "WAZUH",
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      title: "Other Org SE",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      correlationKey: `case-other-corr-${Date.now()}`,
    },
  });

  return {
    client,
    asset,
    finding,
    otherFinding,
    securityEvent,
    otherSecurityEvent,
  };
}

async function main() {
  console.log("\n=== Incident Case Management Tests ===\n");

  console.log("Validation");
  assert(
    assignPlaybookSchema.safeParse({ playbookId: "syspb_generic_security" })
      .success,
    "assignPlaybookSchema accepts playbookId"
  );
  assert(
    !setResponseTaskStatusSchema.safeParse({ status: "BLOCKED" }).success,
    "BLOCKED without blockedReason rejected"
  );
  assert(
    setResponseTaskStatusSchema.safeParse({
      status: "BLOCKED",
      blockedReason: "Waiting on vendor",
    }).success,
    "BLOCKED with blockedReason accepted"
  );
  assert(
    !setResponseTaskStatusSchema.safeParse({ status: "SKIPPED" }).success,
    "SKIPPED without skipReason rejected"
  );
  assert(
    !closeIncidentCaseSchema.safeParse({ closingNote: "" }).success,
    "Empty closingNote rejected"
  );

  try {
    assertValidEvidenceUrl("https://example.com/evidence");
    assert(true, "https URL accepted");
  } catch {
    assert(false, "https URL accepted");
  }
  try {
    assertValidEvidenceUrl("javascript:alert(1)");
    assert(false, "javascript URL rejected");
  } catch {
    assert(true, "javascript URL rejected");
  }

  const ctx = await setup();

  try {
    await ensureSystemPlaybooksExist();

    console.log("\nCase numbers");
    const created = await createIncident({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      data: {
        clientId: ctx.client.id,
        assetId: ctx.asset.id,
        title: "Case Incident Alpha",
        description: "Case management test incident",
        severity: "HIGH",
        category: "MALWARE",
        source: "MANUAL",
        detectionMethod: "MANUAL",
        assignedToUserId: null,
        occurredAt: null,
        businessImpact: null,
        technicalImpact: null,
        findingId: null,
      },
    });
    const incident = await prisma.incident.findUnique({
      where: { id: created.id },
    });
    assert(Boolean(incident?.caseNumber), "caseNumber allocated on create");
    assert(
      /^INC-\d{4}-\d{6}$/.test(incident?.caseNumber ?? ""),
      "caseNumber format INC-YYYY-NNNNNN"
    );

    const second = await createIncident({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      data: {
        clientId: ctx.client.id,
        assetId: null,
        title: "Case Incident Beta",
        description: "Second case for unique case-number check",
        severity: "MEDIUM",
        category: "OTHER",
        source: "MANUAL",
        detectionMethod: "MANUAL",
        assignedToUserId: null,
        occurredAt: null,
        businessImpact: null,
        technicalImpact: null,
        findingId: null,
      },
    });
    const secondIncident = await prisma.incident.findUnique({
      where: { id: second.id },
    });
    assert(
      secondIncident?.caseNumber !== incident?.caseNumber,
      "case numbers unique within org"
    );

    const seqNum = await allocateNextCaseNumber(TEST_ORG_ID);
    assert(
      seqNum !== incident?.caseNumber && seqNum !== secondIncident?.caseNumber,
      "Sequential case numbers increment"
    );

    console.log("\nPlaybooks");
    const playbooks = await listPlaybooks(TEST_ORG_ID);
    assert(playbooks.length >= 6, "At least 6 system playbooks listed");
    const malware = playbooks.find((p) => p.name === "Malware Investigation");
    assert(Boolean(malware), "Malware Investigation playbook present");

    const suggestion = await suggestPlaybook(TEST_ORG_ID, created.id);
    assert(
      suggestion?.name === "Malware Investigation",
      "suggestPlaybook matches MALWARE category"
    );

    const assigned = await assignPlaybookToIncident({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      playbookId: malware!.id,
    });
    assert(assigned.taskCount >= 4, "Playbook assignment creates tasks");

    const tasksBeforeEdit = await listResponseTasks(TEST_ORG_ID, created.id);
    assert(
      tasksBeforeEdit.length === assigned.taskCount,
      "Tasks listed for incident"
    );
    const snapshotTitles = tasksBeforeEdit.map((t) => t.title).sort();

    const firstStep = await prisma.playbookStep.findFirst({
      where: { playbookId: malware!.id },
      orderBy: { order: "asc" },
    });
    assert(Boolean(firstStep), "Playbook template step exists");
    if (firstStep) {
      await prisma.playbookStep.update({
        where: { id: firstStep.id },
        data: { title: `EDITED TEMPLATE ${Date.now()}` },
      });
    }

    const tasksAfterEdit = await listResponseTasks(TEST_ORG_ID, created.id);
    const afterTitles = tasksAfterEdit.map((t) => t.title).sort();
    assert(
      JSON.stringify(snapshotTitles) === JSON.stringify(afterTitles),
      "Template edit does not change playbook instance tasks"
    );

    // Restore template title for other environments sharing system playbooks
    if (firstStep) {
      await prisma.playbookStep.update({
        where: { id: firstStep.id },
        data: { title: firstStep.title },
      });
    }

    const activityPb = await prisma.incidentActivity.findFirst({
      where: {
        incidentId: created.id,
        activityType: "PLAYBOOK_ASSIGNED",
      },
    });
    assert(Boolean(activityPb), "PLAYBOOK_ASSIGNED activity recorded");

    console.log("\nResponse tasks");
    const manualTask = await createResponseTask({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      phase: "INVESTIGATION",
      title: "Manual investigation note",
      isRequired: false,
    });
    assert(Boolean(manualTask.id), "Manual task created");

    await assignResponseTask({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      taskId: manualTask.id,
      assignedToUserId: TEST_USER_ID,
    });

    let blockedWithoutReason = false;
    try {
      await setResponseTaskStatus({
        organizationId: TEST_ORG_ID,
        actorId: TEST_USER_ID,
        taskId: manualTask.id,
        status: "BLOCKED",
      });
    } catch {
      blockedWithoutReason = true;
    }
    assert(blockedWithoutReason, "BLOCKED requires reason");

    await setResponseTaskStatus({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      taskId: manualTask.id,
      status: "BLOCKED",
      blockedReason: "Waiting on log export",
    });

    const requiredTask = tasksAfterEdit.find((t) => t.isRequired);
    assert(Boolean(requiredTask), "Required playbook task exists");
    if (requiredTask) {
      let skipWithoutReason = false;
      try {
        await setResponseTaskStatus({
          organizationId: TEST_ORG_ID,
          actorId: TEST_USER_ID,
          taskId: requiredTask.id,
          status: "SKIPPED",
        });
      } catch {
        skipWithoutReason = true;
      }
      assert(skipWithoutReason, "Required SKIPPED requires skipReason");
    }

    let crossOrgTaskBlocked = false;
    try {
      await setResponseTaskStatus({
        organizationId: OTHER_ORG_ID,
        actorId: OTHER_USER_ID,
        taskId: manualTask.id,
        status: "COMPLETED",
      });
    } catch {
      crossOrgTaskBlocked = true;
    }
    assert(crossOrgTaskBlocked, "Cross-org task update blocked");

    console.log("\nEvidence");
    const noteEv = await addNoteEvidence({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      title: "Analyst observation",
      description: "Observed anomalous process tree",
      url: "https://example.com/notes/1",
    });
    assert(Boolean(noteEv.id), "Note evidence added");

    const seEv = await linkSecurityEventEvidence({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      securityEventId: ctx.securityEvent.id,
    });
    assert(Boolean(seEv.id), "Security event evidence linked");

    let dupSeBlocked = false;
    try {
      await linkSecurityEventEvidence({
        organizationId: TEST_ORG_ID,
        actorId: TEST_USER_ID,
        incidentId: created.id,
        securityEventId: ctx.securityEvent.id,
      });
    } catch {
      dupSeBlocked = true;
    }
    assert(dupSeBlocked, "Duplicate SE evidence link blocked");

    let crossOrgSeBlocked = false;
    try {
      await linkSecurityEventEvidence({
        organizationId: TEST_ORG_ID,
        actorId: TEST_USER_ID,
        incidentId: created.id,
        securityEventId: ctx.otherSecurityEvent.id,
      });
    } catch {
      crossOrgSeBlocked = true;
    }
    assert(crossOrgSeBlocked, "Cross-org security event evidence blocked");

    const findingEv = await linkFindingEvidence({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      findingId: ctx.finding.id,
    });
    assert(Boolean(findingEv.id), "Finding evidence linked");

    let crossOrgFindingBlocked = false;
    try {
      await linkFindingEvidence({
        organizationId: TEST_ORG_ID,
        actorId: TEST_USER_ID,
        incidentId: created.id,
        findingId: ctx.otherFinding.id,
      });
    } catch {
      crossOrgFindingBlocked = true;
    }
    assert(crossOrgFindingBlocked, "Cross-org finding evidence blocked");

    const evidence = await listEvidence(TEST_ORG_ID, created.id);
    assert(evidence.length >= 3, "Evidence list includes all items");

    console.log("\nOwnership");
    await setLeadAnalyst({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      leadAnalystUserId: TEST_USER_ID,
    });
    const withLead = await prisma.incident.findUnique({
      where: { id: created.id },
    });
    assert(
      withLead?.leadAnalystUserId === TEST_USER_ID,
      "Lead analyst assigned"
    );

    let analystCannotSetCommander = false;
    try {
      await setCommander({
        organizationId: TEST_ORG_ID,
        actorId: TEST_USER_ID,
        incidentId: created.id,
        commanderUserId: TEST_ADMIN_ID,
      });
    } catch {
      analystCannotSetCommander = true;
    }
    assert(analystCannotSetCommander, "ANALYST cannot set commander");

    await setCommander({
      organizationId: TEST_ORG_ID,
      actorId: TEST_ADMIN_ID,
      incidentId: created.id,
      commanderUserId: TEST_ADMIN_ID,
    });
    const withCmd = await prisma.incident.findUnique({
      where: { id: created.id },
    });
    assert(withCmd?.commanderUserId === TEST_ADMIN_ID, "Commander assigned");

    let analystAsCommanderBlocked = false;
    try {
      await setCommander({
        organizationId: TEST_ORG_ID,
        actorId: TEST_ADMIN_ID,
        incidentId: created.id,
        commanderUserId: TEST_USER_ID,
      });
    } catch {
      analystAsCommanderBlocked = true;
    }
    assert(
      analystAsCommanderBlocked,
      "Commander target must be ADMIN/OWNER"
    );

    console.log("\nClosure gates");
    const closeBlocked = await assertCanCloseIncident({
      organizationId: TEST_ORG_ID,
      incidentId: created.id,
      closingNote: "Closing without prep",
    });
    assert(!closeBlocked.ok, "Close blocked without resolution/tasks");

    await prisma.incident.update({
      where: { id: created.id },
      data: {
        resolutionSummary: "Threat contained and eradicated",
        rootCause: "Phishing-delivered malware",
        containmentSummary: "Hosts isolated via EDR",
        impactSummary: "Limited to two endpoints",
      },
    });

    const required = await prisma.incidentResponseTask.findMany({
      where: {
        organizationId: TEST_ORG_ID,
        incidentId: created.id,
        isRequired: true,
      },
    });
    for (const t of required) {
      if (t.status === "BLOCKED") {
        await setResponseTaskStatus({
          organizationId: TEST_ORG_ID,
          actorId: TEST_USER_ID,
          taskId: t.id,
          status: "SKIPPED",
          skipReason: "Not applicable after containment",
        });
      } else {
        await setResponseTaskStatus({
          organizationId: TEST_ORG_ID,
          actorId: TEST_USER_ID,
          taskId: t.id,
          status: "COMPLETED",
          completionNote: "Done",
        });
      }
    }
    await setResponseTaskStatus({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      taskId: manualTask.id,
      status: "COMPLETED",
      completionNote: "Logs received",
    });

    const closeOk = await assertCanCloseIncident({
      organizationId: TEST_ORG_ID,
      incidentId: created.id,
      closingNote: "Case closed after successful remediation",
    });
    assert(closeOk.ok, "Close allowed when requirements met");

    const emptyNote = await assertCanCloseIncident({
      organizationId: TEST_ORG_ID,
      incidentId: created.id,
      closingNote: "   ",
    });
    assert(!emptyNote.ok, "Empty closingNote rejected by closure gate");

    // Advance lifecycle to CLOSED via allowed transitions
    await updateIncidentStatus({
      organizationId: TEST_ORG_ID,
      actorId: TEST_ADMIN_ID,
      incidentId: created.id,
      status: "INVESTIGATING",
    });
    await updateIncidentStatus({
      organizationId: TEST_ORG_ID,
      actorId: TEST_ADMIN_ID,
      incidentId: created.id,
      status: "RESOLVED",
    });
    await updateIncidentStatus({
      organizationId: TEST_ORG_ID,
      actorId: TEST_ADMIN_ID,
      incidentId: created.id,
      status: "CLOSED",
      closingNote: "Case closed after successful remediation",
    });

    console.log("\nReopen");
    let reopenWithoutReason = false;
    try {
      await updateIncidentStatus({
        organizationId: TEST_ORG_ID,
        actorId: TEST_ADMIN_ID,
        incidentId: created.id,
        status: "INVESTIGATING",
      });
    } catch {
      reopenWithoutReason = true;
    }
    assert(reopenWithoutReason, "Reopen requires reason");

    await updateIncidentStatus({
      organizationId: TEST_ORG_ID,
      actorId: TEST_ADMIN_ID,
      incidentId: created.id,
      status: "INVESTIGATING",
      reason: "New indicators observed",
    });
    const reopened = await prisma.incident.findUnique({
      where: { id: created.id },
    });
    assert(reopened?.status === "INVESTIGATING", "Reopen with reason succeeds");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
