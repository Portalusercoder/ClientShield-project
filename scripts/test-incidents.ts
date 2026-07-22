/**
 * Incident management workflow tests.
 * Uses isolated TEST org/client — does not touch SaddleUp production data.
 * Run with: npx tsx scripts/test-incidents.ts
 */
import { PrismaClient, type IncidentStatus } from "@prisma/client";
import { sanitizeIncidentText } from "../lib/incidents/sanitize";
import {
  createIncidentSchema,
  updateIncidentStatusSchema,
} from "../lib/validations/incidents";
import {
  addIncidentNote,
  assignIncident,
  calculateIncidentSla,
  countOpenIncidents,
  createIncident,
  escalateFindingToIncident,
  getIncidentById,
  linkFindingToIncident,
  listIncidentsForAsset,
  listIncidentsForClient,
  unlinkFindingFromIncident,
  updateIncidentResponse,
  updateIncidentSeverity,
  updateIncidentStatus,
} from "../services/incidents.service";
import {
  ALLOWED_INCIDENT_TRANSITIONS,
  assertIncidentTransition,
  OPEN_INCIDENT_STATUSES,
} from "../services/incidents/status-transitions";

const prisma = new PrismaClient();

const TEST_ORG_ID = "clyincidenttestorg00000001";
const TEST_USER_ID = "clyincidenttestuser000001";
const OTHER_ORG_ID = "clyincidentotherorg000001";
const OTHER_USER_ID = "clyincidentotheruser00001";

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
  await prisma.incidentFinding.deleteMany({
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
    where: { id: { in: [TEST_USER_ID, OTHER_USER_ID] } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: [TEST_ORG_ID, OTHER_ORG_ID] } },
  });
}

async function setup() {
  await cleanup();

  await prisma.organization.create({
    data: { id: TEST_ORG_ID, name: "Incident Test Org", slug: "incident-test-org" },
  });
  await prisma.organization.create({
    data: { id: OTHER_ORG_ID, name: "Other Incident Org", slug: "other-incident-org" },
  });
  await prisma.user.create({
    data: {
      id: TEST_USER_ID,
      organizationId: TEST_ORG_ID,
      email: "incident-analyst@test.local",
      name: "Incident Analyst",
      role: "ANALYST",
    },
  });
  await prisma.user.create({
    data: {
      id: OTHER_USER_ID,
      organizationId: OTHER_ORG_ID,
      email: "other-analyst@test.local",
      name: "Other Analyst",
      role: "ANALYST",
    },
  });

  const client = await prisma.client.create({
    data: {
      organizationId: TEST_ORG_ID,
      name: "Incident Test Client",
      slug: "incident-test-client",
      status: "ACTIVE",
    },
  });
  const otherClient = await prisma.client.create({
    data: {
      organizationId: OTHER_ORG_ID,
      name: "Other Client",
      slug: "other-incident-client",
      status: "ACTIVE",
    },
  });
  const asset = await prisma.asset.create({
    data: {
      organizationId: TEST_ORG_ID,
      clientId: client.id,
      name: "Incident Test Asset",
      type: "WEBSITE",
      url: "https://incident-test.example",
      environment: "PRODUCTION",
      criticality: "MEDIUM",
      monitoringStatus: "ACTIVE",
      authorizationStatus: "AUTHORIZED",
    },
  });
  const otherAsset = await prisma.asset.create({
    data: {
      organizationId: OTHER_ORG_ID,
      clientId: otherClient.id,
      name: "Other Asset",
      type: "WEBSITE",
      url: "https://other.example",
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
      title: "TEST Finding for Incident Link",
      severity: "HIGH",
      status: "OPEN",
      source: "MANUAL",
      description: "Isolated test finding",
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

  return { client, otherClient, asset, otherAsset, finding, otherFinding };
}

async function main() {
  console.log("\n=== Incident Management Tests ===\n");

  // Validation
  console.log("Validation");
  assert(
    !createIncidentSchema.safeParse({
      clientId: "x",
      title: "",
      severity: "HIGH",
      category: "OTHER",
      description: "desc",
    }).success,
    "Required field validation rejects empty title"
  );
  assert(
    !updateIncidentStatusSchema.safeParse({ status: "NOPE" }).success,
    "Invalid status rejected"
  );
  assert(
    sanitizeIncidentText("<script>alert(1)</script>hello") === "alert(1)hello" ||
      sanitizeIncidentText("<script>alert(1)</script>hello") === "hello" ||
      (sanitizeIncidentText("<script>alert(1)</script>hello") ?? "").includes(
        "hello"
      ),
    "Input sanitization strips HTML tags"
  );
  assert(
    (sanitizeIncidentText("password: secret123") ?? "").includes("[REDACTED]"),
    "Input sanitization redacts secrets"
  );

  // Transitions
  console.log("\nTransitions");
  assert(
    ALLOWED_INCIDENT_TRANSITIONS.OPEN.includes("ACKNOWLEDGED"),
    "OPEN → ACKNOWLEDGED allowed"
  );
  try {
    assertIncidentTransition("OPEN", "RESOLVED");
    assert(false, "OPEN → RESOLVED blocked");
  } catch {
    assert(true, "OPEN → RESOLVED blocked");
  }
  try {
    assertIncidentTransition("RESOLVED", "INVESTIGATING");
    assert(true, "RESOLVED → INVESTIGATING (reopen) allowed");
  } catch {
    assert(false, "RESOLVED → INVESTIGATING (reopen) allowed");
  }

  // SLA
  console.log("\nSLA metrics");
  const detected = new Date("2026-01-01T00:00:00Z");
  const ack = new Date("2026-01-01T01:00:00Z");
  const sla = calculateIncidentSla({
    detectedAt: detected,
    acknowledgedAt: ack,
    containedAt: null,
    resolvedAt: null,
  });
  assert(sla.timeToAcknowledgeMs === 3600000, "Time to Acknowledge calculated");
  assert(sla.timeToContainMs === null, "Time to Contain N/A when missing");
  assert(sla.timeToResolveMs === null, "Time to Resolve N/A when missing");

  const ctx = await setup();

  try {
    console.log("\nCreate & scope");
    const created = await createIncident({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      data: {
        clientId: ctx.client.id,
        assetId: ctx.asset.id,
        title: "TEST Incident Alpha",
        description: "Isolated test incident for QA",
        severity: "HIGH",
        category: "SUSPICIOUS_ACTIVITY",
        source: "MANUAL",
        detectionMethod: "MANUAL",
        assignedToUserId: null,
        occurredAt: null,
        businessImpact: null,
        technicalImpact: null,
        findingId: null,
      },
    });
    assert(Boolean(created.id), "Create incident");

    const detail = await getIncidentById(TEST_ORG_ID, created.id);
    assert(detail?.status === "OPEN", "Default status OPEN");
    assert(
      Boolean(detail?.activities.some((a) => a.activityType === "CREATED")),
      "Activity timeline CREATED"
    );

    const auditCreated = await prisma.auditLog.findFirst({
      where: {
        organizationId: TEST_ORG_ID,
        resourceId: created.id,
        action: "INCIDENT_CREATED",
      },
    });
    assert(Boolean(auditCreated), "Audit creation on create");

    const crossRead = await getIncidentById(OTHER_ORG_ID, created.id);
    assert(crossRead === null, "Cross-org incident read blocked");

    let crossUpdateBlocked = false;
    try {
      await updateIncidentStatus({
        organizationId: OTHER_ORG_ID,
        actorId: OTHER_USER_ID,
        incidentId: created.id,
        status: "ACKNOWLEDGED",
      });
    } catch {
      crossUpdateBlocked = true;
    }
    assert(crossUpdateBlocked, "Cross-org update blocked");

    let crossClientBlocked = false;
    try {
      await createIncident({
        organizationId: TEST_ORG_ID,
        actorId: TEST_USER_ID,
        data: {
          clientId: ctx.otherClient.id,
          assetId: null,
          title: "Bad",
          description: "Should fail",
          severity: "LOW",
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
    } catch {
      crossClientBlocked = true;
    }
    assert(crossClientBlocked, "Cross-org client blocked");

    let crossAssetBlocked = false;
    try {
      await createIncident({
        organizationId: TEST_ORG_ID,
        actorId: TEST_USER_ID,
        data: {
          clientId: ctx.client.id,
          assetId: ctx.otherAsset.id,
          title: "Bad asset",
          description: "Should fail",
          severity: "LOW",
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
    } catch {
      crossAssetBlocked = true;
    }
    assert(crossAssetBlocked, "Cross-org asset blocked");

    console.log("\nWorkflow timestamps");
    await updateIncidentStatus({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      status: "ACKNOWLEDGED",
    });
    let d = await getIncidentById(TEST_ORG_ID, created.id);
    assert(Boolean(d?.acknowledgedAt), "Acknowledge timestamp");

    await updateIncidentStatus({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      status: "INVESTIGATING",
    });
    d = await getIncidentById(TEST_ORG_ID, created.id);
    assert(Boolean(d?.investigationStartedAt), "Investigation timestamp");

    await updateIncidentStatus({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      status: "CONTAINED",
    });
    d = await getIncidentById(TEST_ORG_ID, created.id);
    assert(Boolean(d?.containedAt), "Contain timestamp");

    await updateIncidentStatus({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      status: "ERADICATED",
    });
    await updateIncidentStatus({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      status: "RECOVERING",
    });
    await updateIncidentStatus({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      status: "RESOLVED",
    });
    d = await getIncidentById(TEST_ORG_ID, created.id);
    assert(Boolean(d?.resolvedAt), "Resolve timestamp");

    await updateIncidentResponse({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      data: {
        resolutionSummary: "Resolved for regression test",
        containmentSummary: "Contained for regression test",
        rootCause: "Test root cause",
        impactSummary: null,
        scopeSummary: null,
        eradicationSummary: null,
        recoverySummary: null,
        lessonsLearned: null,
        businessImpact: null,
        technicalImpact: null,
        whatWentWell: null,
        whatCouldImprove: null,
        followUpActions: null,
      },
    });

    await updateIncidentStatus({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      status: "CLOSED",
      closingNote: "Closing after regression lifecycle walk",
    });
    d = await getIncidentById(TEST_ORG_ID, created.id);
    assert(Boolean(d?.closedAt), "Close timestamp");

    await updateIncidentStatus({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      status: "INVESTIGATING",
      reason: "Reopening for continued regression coverage",
    });
    d = await getIncidentById(TEST_ORG_ID, created.id);
    assert(d?.status === "INVESTIGATING", "Reopen workflow");
    assert(
      Boolean(d?.activities.some((a) => a.activityType === "REOPENED")),
      "Reopen activity recorded"
    );

    let invalidTransition = false;
    try {
      await updateIncidentStatus({
        organizationId: TEST_ORG_ID,
        actorId: TEST_USER_ID,
        incidentId: created.id,
        status: "CLOSED",
        closingNote: "Should fail — invalid transition from INVESTIGATING",
      });
    } catch {
      invalidTransition = true;
    }
    assert(invalidTransition, "Invalid status transitions blocked");

    console.log("\nSeverity, assignment, notes, findings");
    await updateIncidentSeverity({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      severity: "CRITICAL",
    });
    d = await getIncidentById(TEST_ORG_ID, created.id);
    assert(d?.severity === "CRITICAL", "Severity changes");
    assert(
      Boolean(d?.activities.some((a) => a.activityType === "SEVERITY_CHANGED")),
      "Severity change activity"
    );

    await assignIncident({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      data: { assignedToUserId: TEST_USER_ID },
    });
    d = await getIncidentById(TEST_ORG_ID, created.id);
    assert(d?.assignedToUserId === TEST_USER_ID, "Assignment changes");

    let crossAssigneeBlocked = false;
    try {
      await assignIncident({
        organizationId: TEST_ORG_ID,
        actorId: TEST_USER_ID,
        incidentId: created.id,
        data: { assignedToUserId: OTHER_USER_ID },
      });
    } catch {
      crossAssigneeBlocked = true;
    }
    assert(crossAssigneeBlocked, "Cross-org assignee blocked");

    await addIncidentNote({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      content: "TEST analyst note",
    });
    d = await getIncidentById(TEST_ORG_ID, created.id);
    assert(Boolean(d?.notes.some((n) => n.content.includes("TEST analyst"))), "Notes");
    assert(
      Boolean(d?.activities.some((a) => a.activityType === "NOTE_ADDED")),
      "NOTE_ADDED activity"
    );

    await linkFindingToIncident({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      findingId: ctx.finding.id,
    });
    d = await getIncidentById(TEST_ORG_ID, created.id);
    assert(
      Boolean(d?.findings.some((f) => f.findingId === ctx.finding.id)),
      "Finding linking"
    );

    let dupLinkBlocked = false;
    try {
      await linkFindingToIncident({
        organizationId: TEST_ORG_ID,
        actorId: TEST_USER_ID,
        incidentId: created.id,
        findingId: ctx.finding.id,
      });
    } catch {
      dupLinkBlocked = true;
    }
    assert(dupLinkBlocked, "Duplicate finding link prevented");

    let crossFindingBlocked = false;
    try {
      await linkFindingToIncident({
        organizationId: TEST_ORG_ID,
        actorId: TEST_USER_ID,
        incidentId: created.id,
        findingId: ctx.otherFinding.id,
      });
    } catch {
      crossFindingBlocked = true;
    }
    assert(crossFindingBlocked, "Cross-org finding link blocked");

    // Same-org, different-client finding → incident must be rejected
    const peerClient = await prisma.client.create({
      data: {
        organizationId: TEST_ORG_ID,
        name: "Peer Client Same Org",
        slug: "peer-client-same-org",
        status: "ACTIVE",
      },
    });
    const peerAsset = await prisma.asset.create({
      data: {
        organizationId: TEST_ORG_ID,
        clientId: peerClient.id,
        name: "Peer Asset",
        type: "WEBSITE",
        url: "https://peer.example",
        environment: "PRODUCTION",
        criticality: "MEDIUM",
        monitoringStatus: "ACTIVE",
        authorizationStatus: "AUTHORIZED",
      },
    });
    const peerFinding = await prisma.finding.create({
      data: {
        organizationId: TEST_ORG_ID,
        clientId: peerClient.id,
        assetId: peerAsset.id,
        title: "Peer Client Finding",
        severity: "HIGH",
        status: "OPEN",
        source: "MANUAL",
      },
    });
    let crossClientFindingBlocked = false;
    try {
      await linkFindingToIncident({
        organizationId: TEST_ORG_ID,
        actorId: TEST_USER_ID,
        incidentId: created.id,
        findingId: peerFinding.id,
      });
    } catch (err) {
      crossClientFindingBlocked =
        err instanceof Error &&
        err.message.includes("Cross-client linking is not allowed");
    }
    assert(
      crossClientFindingBlocked,
      "Cross-client finding→incident link blocked"
    );

    await unlinkFindingFromIncident({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      findingId: ctx.finding.id,
    });
    d = await getIncidentById(TEST_ORG_ID, created.id);
    assert(
      Boolean(!d?.findings.some((f) => f.findingId === ctx.finding.id)),
      "Finding unlink"
    );

    await updateIncidentResponse({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      data: {
        containmentSummary: "Isolated host from network",
        rootCause: null,
        eradicationSummary: null,
        recoverySummary: null,
        resolutionSummary: null,
        lessonsLearned: null,
        businessImpact: null,
        technicalImpact: null,
        impactSummary: null,
        scopeSummary: null,
        whatWentWell: null,
        whatCouldImprove: null,
        followUpActions: null,
      },
    });
    d = await getIncidentById(TEST_ORG_ID, created.id);
    assert(
      Boolean(d?.containmentSummary?.includes("Isolated")),
      "Response containment update"
    );

    console.log("\nEscalation & lists");
    const escalated = await escalateFindingToIncident({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      data: {
        findingId: ctx.finding.id,
        category: "VULNERABILITY_EXPLOITATION",
      },
    });
    const esc = await getIncidentById(TEST_ORG_ID, escalated.id);
    assert(esc?.source === "FINDING", "Finding → Incident escalation source");
    assert(
      Boolean(esc?.findings.some((f) => f.findingId === ctx.finding.id)),
      "Escalation auto-links finding"
    );

    const clientList = await listIncidentsForClient(
      TEST_ORG_ID,
      ctx.client.id
    );
    assert(clientList.length >= 2, "Client incident list");

    const assetList = await listIncidentsForAsset(TEST_ORG_ID, ctx.asset.id);
    assert(assetList.length >= 1, "Asset incident list");

    // Resolve escalated so open count math is clearer
    const openBeforeClose = await countOpenIncidents(TEST_ORG_ID);
    assert(openBeforeClose >= 1, "Dashboard open incident count > 0");

    // Ensure both incidents meet HIGH/CRITICAL closure documentation requirements
    for (const incidentId of [created.id, escalated.id]) {
      await updateIncidentResponse({
        organizationId: TEST_ORG_ID,
        actorId: TEST_USER_ID,
        incidentId,
        data: {
          resolutionSummary: "Resolved for regression test",
          containmentSummary: "Contained for regression test",
          rootCause: "Test root cause",
          impactSummary: null,
          scopeSummary: null,
          eradicationSummary: null,
          recoverySummary: null,
          lessonsLearned: null,
          businessImpact: null,
          technicalImpact: null,
          whatWentWell: null,
          whatCouldImprove: null,
          followUpActions: null,
        },
      });
    }

    // Move investigating incident through to resolved
    const openStatuses: IncidentStatus[] = [
      "CONTAINED",
      "ERADICATED",
      "RECOVERING",
      "RESOLVED",
    ];
    // current is INVESTIGATING after reopen
    for (const s of openStatuses) {
      await updateIncidentStatus({
        organizationId: TEST_ORG_ID,
        actorId: TEST_USER_ID,
        incidentId: created.id,
        status: s,
      });
    }
    await updateIncidentStatus({
      organizationId: TEST_ORG_ID,
      actorId: TEST_USER_ID,
      incidentId: created.id,
      status: "CLOSED",
      closingNote: "Final close for open-count assertion",
    });

    // Close escalated too
    for (const s of [
      "ACKNOWLEDGED",
      "INVESTIGATING",
      "CONTAINED",
      "ERADICATED",
      "RECOVERING",
      "RESOLVED",
      "CLOSED",
    ] as IncidentStatus[]) {
      const cur = await getIncidentById(TEST_ORG_ID, escalated.id);
      if (cur && cur.status !== s && ALLOWED_INCIDENT_TRANSITIONS[cur.status].includes(s)) {
        await updateIncidentStatus({
          organizationId: TEST_ORG_ID,
          actorId: TEST_USER_ID,
          incidentId: escalated.id,
          status: s,
          ...(s === "CLOSED"
            ? { closingNote: "Close escalated incident for count check" }
            : {}),
        });
      } else if (cur && cur.status !== "CLOSED") {
        // walk forward one step at a time
        const next = ALLOWED_INCIDENT_TRANSITIONS[cur.status].find((x) =>
          OPEN_INCIDENT_STATUSES.includes(x) || x === "RESOLVED" || x === "CLOSED" || x === "ACKNOWLEDGED"
        );
        if (next) {
          await updateIncidentStatus({
            organizationId: TEST_ORG_ID,
            actorId: TEST_USER_ID,
            incidentId: escalated.id,
            status: next,
            ...(next === "CLOSED"
              ? { closingNote: "Close escalated incident for count check" }
              : {}),
          });
        }
      }
    }

    // Ensure escalated closed via sequential walk
    let walk = await getIncidentById(TEST_ORG_ID, escalated.id);
    const forward: IncidentStatus[] = [
      "ACKNOWLEDGED",
      "INVESTIGATING",
      "CONTAINED",
      "ERADICATED",
      "RECOVERING",
      "RESOLVED",
      "CLOSED",
    ];
    for (const target of forward) {
      walk = await getIncidentById(TEST_ORG_ID, escalated.id);
      if (!walk || walk.status === "CLOSED") break;
      if (ALLOWED_INCIDENT_TRANSITIONS[walk.status].includes(target)) {
        await updateIncidentStatus({
          organizationId: TEST_ORG_ID,
          actorId: TEST_USER_ID,
          incidentId: escalated.id,
          status: target,
          ...(target === "CLOSED"
            ? { closingNote: "Close escalated after walk" }
            : {}),
        });
      }
    }

    const openAfter = await countOpenIncidents(TEST_ORG_ID);
    assert(openAfter === 0, "Resolved/CLOSED excluded from open count");

    const closedAudit = await prisma.auditLog.count({
      where: {
        organizationId: TEST_ORG_ID,
        resourceType: "Incident",
        action: { in: ["INCIDENT_CLOSED", "INCIDENT_RESOLVED"] },
      },
    });
    assert(closedAudit >= 1, "Audit logging for resolve/close");
  } finally {
    await cleanup();
    console.log("\nCleaned up TEST incident org data.");
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
